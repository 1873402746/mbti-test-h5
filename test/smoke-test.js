/**
 * 冒烟测试 v2 —— 对应「64 题库 / 每次随机抽 32 题 / 每题 4 选项 / 加权计分」的新版本。
 *
 * 覆盖点：
 *   0. 前置验证码：初始停在 gate、错误码被拒、位数不足被拒、正确码 1783 放行、整串粘贴清洗
 *   1. 随机组卷：每次 32 题、四维各 8 题、卷内不重复、选项内容完整
 *   2. 加权计分：按「强左 / 弱左 / 弱右 / 弱右」模式作答，每维度累计 左 6 : 右 4（60%）。
 *      若计分退化成简单计数，结果会变成 4:4 平局（兜底 INFP）而不是 ESTJ —— 以此锁住加权逻辑
 *   3. 随机性：重新测试后题目序列应发生变化
 *   4. 结果页渲染：类型码 / 名称 / 标签 / 优势 / 盲点 / 四维条 / 一致性 / 分享文案
 *   5. 容错：缺 groups 降级、结果库缺类型走兜底页、数据加载失败给提示
 *
 * 用法：
 *   node test/smoke-test.js
 *   SMOKE_FAULT=groups       node test/smoke-test.js
 *   SMOKE_FAULT=missing-type node test/smoke-test.js
 *   SMOKE_FAULT=nodata       node test/smoke-test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const FAULT = process.env.SMOKE_FAULT || "";
const errors = [];

/* ---------- 题库映射：题干 → 题目，选项文本 → {score, weight} ---------- */
const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "questions.json"), "utf8"));
const PER_DIM = BANK.perDimension || 8;
const PAPER_SIZE = PER_DIM * 4;

const Q_BY_TEXT = {};
const OPT_BY_TEXT = {};
BANK.questions.forEach(function (q) {
  Q_BY_TEXT[q.text] = q;
  q.options.forEach(function (o) {
    OPT_BY_TEXT[o.text] = { score: o.score, weight: o.weight, dim: q.dim };
  });
});

/* ---------- 最小 DOM 桩 ---------- */
const elCache = {};
const created = [];

// 先从 index.html 收集全部 id：桩只认得真实存在的 id，
// 这样 app.js 一旦引用了 HTML 里没有的元素就会立刻暴露，而不是被静默造出一个假元素
const HTML_TEXT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const DOM_IDS = new Set();
(function collectIds() {
  const re = /\bid="([^"]+)"/g;
  let m;
  while ((m = re.exec(HTML_TEXT)) !== null) DOM_IDS.add(m[1]);
})();

function makeStyle() {
  const s = {};
  s.setProperty = function (k, v) { s[k] = v; };
  return s;
}

function El(tag) {
  const el = {
    tag: tag,
    children: [],
    style: makeStyle(),
    _html: "",
    _cls: new Set(),
    _handlers: {},
    textContent: "",
    value: "",
    visibility: "",
    disabled: false,
    classList: {
      add: function (c) { el._cls.add(c); },
      remove: function (c) { el._cls.delete(c); },
      toggle: function (c, on) { if (on) el._cls.add(c); else el._cls.delete(c); },
      contains: function (c) { return el._cls.has(c); }
    },
    appendChild: function (c) { el.children.push(c); return c; },
    removeChild: function (c) {
      const i = el.children.indexOf(c);
      if (i > -1) el.children.splice(i, 1);
      return c;
    },
    querySelector: function () { return El("div"); },
    querySelectorAll: function () { return []; },
    addEventListener: function (t, fn) { el._handlers[t] = fn; },
    select: function () {},
    remove: function () {},
    focus: function () {}
  };
  Object.defineProperty(el, "innerHTML", {
    get: function () { return el._html; },
    set: function (v) { el._html = v; el.children = []; }
  });
  return el;
}

const document_ = {
  getElementById: function (id) {
    if (!DOM_IDS.has(id)) return null;
    if (!elCache[id]) elCache[id] = El("div");
    return elCache[id];
  },
  createElement: function (tag) {
    const el = El(tag);
    created.push(el);
    return el;
  },
  body: El("body")
};

const window_ = { scrollTo: function () {} };
const navigator_ = {};

/* ---------- fetch 桩：直接读本地 data/*.json ---------- */
function fetchStub(url) {
  if (FAULT === "nodata") {
    return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve(null); } });
  }
  const file = path.join(ROOT, url);
  try {
    const text = fs.readFileSync(file, "utf8");
    const json = JSON.parse(text);
    const isResults = /results\.json$/.test(url);
    if (isResults && FAULT === "groups") delete json.groups;
    if (isResults && FAULT === "missing-type") {
      // 移除一个类型，模拟「结果库不全」；测试作答模式的结果正好是 ESTJ
      json.results = json.results.filter(function (x) { return x.code !== "ESTJ"; });
    }
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(json); } });
  } catch (e) {
    return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve(null); } });
  }
}

/* ---------- 从 index.html 读取初始 active 屏，保证桩与真实页面一致 ---------- */
(function seedActiveScreens() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tags = html.match(/<section\b[^>]*>/g) || [];
  tags.forEach(function (tag) {
    const idM = tag.match(/\bid="([^"]+)"/);
    const clsM = tag.match(/\bclass="([^"]*)"/);
    if (!idM || !clsM) return;
    if (clsM[1].split(/\s+/).indexOf("active") > -1) {
      document_.getElementById(idM[1])._cls.add("active");
    }
  });
})();

/* ---------- 执行 app.js ---------- */
const ctx = vm.createContext({
  document: document_,
  window: window_,
  navigator: navigator_,
  fetch: fetchStub,
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  console: console,
  Promise: Promise,
  Math: Math,
  Object: Object,
  Array: Array
});

process.on("uncaughtException", function (e) {
  errors.push(e);
  console.error("✗ 未捕获异常：", e && e.message);
});

const code = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
vm.runInContext(code, ctx, { filename: "app.js" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ok(msg) { console.log("  ✓ " + msg); }
function bad(msg) { console.log("  ✗ " + msg); errors.push(new Error(msg)); }
function finish() {
  console.log("\n" + (errors.length ? "结果：发现 " + errors.length + " 个问题 ✗" : "结果：全部通过 ✓"));
  process.exit(errors.length ? 1 : 0);
}
function resultActive() {
  return document_.getElementById("screen-result")._cls.has("active");
}
function quizText() {
  return document_.getElementById("quizText").textContent;
}

/* ---------- 作答控制 ---------- */
let createdBefore = 0;
const dimSeen = { EI: 0, SN: 0, TF: 0, JP: 0 };
// 每维度内按此模式循环：强左 / 弱左 / 弱右 / 弱右 → 8 题累计 左 6 : 右 4
const PATTERN = [
  { side: 0, weight: 2 },
  { side: 0, weight: 1 },
  { side: 1, weight: 1 },
  { side: 1, weight: 1 }
];

function lastFour() {
  return created.slice(createdBefore).filter(function (e) { return e.tag === "button"; }).slice(-4);
}

// 根据当前题的维度与出现次序，挑出目标选项按钮，并顺带校验选项内容完整
function pickAnswer(checkOptions) {
  const text = quizText();
  const q = Q_BY_TEXT[text];
  if (!q) return null;
  const four = lastFour();
  if (four.length < 4) return null;

  if (checkOptions) {
    const expect = q.options.map(function (o) { return o.text; }).sort().join("|");
    const actual = four.map(function (b) { return b.textContent; }).sort().join("|");
    if (expect !== actual) {
      bad("第 " + (dimSeen[q.dim] + 1) + " 题选项内容不完整（题库 id " + q.id + "）");
    }
  }

  const n = ++dimSeen[q.dim];
  const want = PATTERN[(n - 1) % 4];
  const targetScore = want.side === 0 ? q.dim[0] : q.dim[1];
  for (let i = 0; i < four.length; i++) {
    const meta = OPT_BY_TEXT[four[i].textContent];
    if (meta && meta.score === targetScore && meta.weight === want.weight) return four[i];
  }
  return null;
}

async function answerOne(checkOptions) {
  const btn = pickAnswer(checkOptions);
  if (!btn) return false;
  btn._handlers.click();
  await sleep(260);
  return true;
}

/* ---------- 主流程 ---------- */
(async function main() {
  console.log("冒烟测试开始" + (FAULT ? "（故障注入：" + FAULT + "）" : "") + "\n");

  await sleep(60);

  console.log("[0] 前置验证码");
  const gateEl = document_.getElementById("screen-gate");
  const coverEl = document_.getElementById("screen-cover");
  const gateActive = () => gateEl._cls.has("active");
  const coverActive = () => coverEl._cls.has("active");
  const gateError = () => document_.getElementById("gateError").textContent;

  if (gateActive() && !coverActive()) ok("初始停留在验证码页，未直通封面");
  else bad("初始页面状态异常：gate=" + gateActive() + " cover=" + coverActive());

  function typeCode(code) {
    for (let i = 0; i < code.length; i++) {
      const el = document_.getElementById("gateInput" + i);
      el.value = code[i];
      el._handlers.input();
    }
  }

  // 错误验证码：必须被拒绝
  typeCode("9999");
  await sleep(320);
  if (!coverActive()) ok("错误验证码未放行");
  else bad("错误验证码竟直接放行");
  if (gateError().indexOf("不正确") > -1) ok("错误提示可见：" + gateError());
  else bad("错误提示缺失：" + JSON.stringify(gateError()));

  // 位数不足点按钮：也不能过
  document_.getElementById("gateInput0").value = "1";
  document_.getElementById("gateBtn")._handlers.click();
  if (!coverActive() && gateError().indexOf("完整") > -1) ok("位数不足时提示：" + gateError());
  else bad("位数不足处理异常：" + JSON.stringify(gateError()));
  document_.getElementById("gateInput0").value = "";

  // 正确验证码：放行进封面
  typeCode("1783");
  await sleep(320);
  if (coverActive()) ok("正确验证码 1783 放行，进入封面页");
  else bad("正确验证码未放行：" + JSON.stringify(gateError()));

  // 整串粘贴 + 非数字清洗
  document_.getElementById("gateInput0")._handlers.paste({
    clipboardData: { getData: function () { return "17-83"; } },
    preventDefault: function () {}
  });
  await sleep(320);
  if (coverActive()) ok("粘贴「17-83」清洗为 1783 后可通过");
  else bad("粘贴处理异常：" + JSON.stringify(gateError()));
  console.log("");

  const startBtn = document_.getElementById("startBtn");

  if (FAULT === "nodata") {
    if (startBtn.textContent.indexOf("数据加载失败") > -1) ok("数据加载失败时给出明确提示：" + startBtn.textContent);
    else bad("数据加载失败未提示，文案：" + JSON.stringify(startBtn.textContent));
    return finish();
  }

  if (startBtn.textContent.indexOf("开始测试") === 0) ok("数据加载成功，开始按钮就绪");
  else bad("开始按钮未就绪，文案：" + JSON.stringify(startBtn.textContent));

  console.log("\n[1] 随机组卷与作答");
  createdBefore = created.length;
  startBtn._handlers.click();
  await sleep(30);

  const paper = [];
  for (let i = 0; i < PAPER_SIZE; i++) {
    const t = quizText();
    if (!t) { bad("第 " + (i + 1) + " 题未渲染出题干"); break; }
    paper.push(t);
    if (!(await answerOne(true))) { bad("第 " + (i + 1) + " 题无法定位目标选项：" + t); break; }
  }
  ok("完成作答，进度条 " + document_.getElementById("progressBar").style.width);

  if (paper.length === PAPER_SIZE) ok("本次试卷题数 = " + PAPER_SIZE);
  else bad("试卷题数异常：" + paper.length + "（期望 " + PAPER_SIZE + "）");

  if (new Set(paper).size === paper.length) ok("卷内题目不重复");
  else bad("卷内出现重复题目 " + (paper.length - new Set(paper).size) + " 道");

  const dist = { EI: 0, SN: 0, TF: 0, JP: 0 };
  paper.forEach(function (t) { const q = Q_BY_TEXT[t]; if (q) dist[q.dim]++; });
  const distOk = ["EI", "SN", "TF", "JP"].every(function (k) { return dist[k] === PER_DIM; });
  if (distOk) ok("四维题量均衡：" + JSON.stringify(dist));
  else bad("四维题量失衡：" + JSON.stringify(dist) + "（期望每维 " + PER_DIM + "）");

  // 等分析动画（3 条 × 620ms）
  await sleep(2200);

  console.log("\n[2] 计分与结果页");

  if (FAULT === "missing-type") {
    if (resultActive()) ok("结果库缺类型时进入兜底页（未卡 loading）");
    else bad("结果库缺类型时仍停留在 loading 页");
    const nm = document_.getElementById("resultName").textContent;
    if (nm.indexOf("无法显示") > -1) ok("兜底文案正确：" + nm);
    else bad("兜底文案异常：" + JSON.stringify(nm));
    if (document_.getElementById("dimBars").children.length === 4) ok("兜底页仍保留四维倾向图（4 组）");
    else bad("兜底页四维倾向图缺失");
    if (document_.getElementById("confLabel").textContent.indexOf("一致性") > -1) ok("兜底页仍输出一致性分析");
    else bad("兜底页一致性分析缺失");
    return finish();
  }

  if (resultActive()) ok("已切到结果页（未卡在 loading）");
  else bad("仍停留在 loading 页 —— 渲染流程中断");

  // 作答模式为「强左/弱左/弱右/弱右」→ 每维度 左 6 : 右 4 → 四个字母都取左极
  const codeText = document_.getElementById("resultCode").textContent;
  if (codeText === "ESTJ") ok("加权计分结果正确：" + codeText + "（若退化为简单计数会是 4:4 平局 → INFP）");
  else bad("类型码异常：" + JSON.stringify(codeText) + "（期望 ESTJ）");

  // 桩里 appendChild 不会回写父节点的 innerHTML，所以从子节点逐个取
  const dimHtml = document_.getElementById("dimBars").children
    .map(function (c) { return c.innerHTML; }).join("");
  const pct60 = (dimHtml.match(/<b>60%<\/b>/g) || []).length;
  const pct40 = (dimHtml.match(/<b>40%<\/b>/g) || []).length;
  if (pct60 === 4 && pct40 === 4) ok("四维百分比正确：每维 60% / 40%（加权 6:4 生效）");
  else bad("四维百分比异常：60% 出现 " + pct60 + " 次、40% 出现 " + pct40 + " 次");

  if (document_.getElementById("dimBars").children.length === 4) ok("四维倾向条渲染 4 组");
  else bad("四维倾向条数量异常：" + document_.getElementById("dimBars").children.length);

  const name = document_.getElementById("resultName").textContent;
  if (name && name.indexOf("undefined") === -1 && name.length > 2) ok("类型名称正常：" + name);
  else bad("类型名称异常：" + JSON.stringify(name));

  if (FAULT === "groups") {
    if (name.indexOf("·") === -1) ok("缺 groups 字段时优雅降级（无分组后缀、未报错）");
    else bad("groups 降级异常：" + name);
  }

  const tagHtml = document_.getElementById("resultTags").innerHTML;
  if ((tagHtml.match(/<span>/g) || []).length === 3) ok("标签渲染 3 个");
  else bad("标签数量异常：" + tagHtml);

  const strengths = document_.getElementById("resultStrengths").innerHTML;
  if ((strengths.match(/<li>/g) || []).length === 4) ok("优势渲染 4 条");
  else bad("优势数量异常：" + strengths);

  const blind = document_.getElementById("resultBlindspots").innerHTML;
  if ((blind.match(/<li>/g) || []).length >= 2) ok("盲点渲染 " + (blind.match(/<li>/g) || []).length + " 条");
  else bad("盲点数量异常：" + blind);

  if (document_.getElementById("resultCareers").innerHTML.indexOf("<span>") > -1) ok("适配方向正常渲染");
  else bad("适配方向为空");

  const conf = document_.getElementById("confLabel").textContent;
  if (conf.indexOf("一致性") > -1) ok("一致性分析输出：" + conf);
  else bad("一致性未输出");

  if (typeof ctx.window.__shareText === "string" && ctx.window.__shareText.length > 5) {
    ok("分享文案已生成：" + ctx.window.__shareText.split("\n")[0]);
  } else bad("分享文案未生成");

  try {
    document_.getElementById("copyBtn")._handlers.click();
    ok("复制按钮无异常");
  } catch (e) { bad("复制按钮报错：" + e.message); }

  console.log("\n[3] 随机性（重新测试后换题）");
  dimSeen.EI = dimSeen.SN = dimSeen.TF = dimSeen.JP = 0;
  document_.getElementById("retryBtn")._handlers.click();
  await sleep(30);

  const paper2 = [quizText()];
  for (let i = 1; i < 6; i++) {
    if (!(await answerOne(false))) break;
    paper2.push(quizText());
  }
  const head1 = paper.slice(0, 5).join("|");
  const head2 = paper2.slice(0, 5).join("|");
  if (head1 !== head2) ok("重新测试后题目序列已变化（随机组卷生效）");
  else bad("重新测试后前 5 题序列完全相同，随机组卷可能未生效");

  const overlap = paper2.slice(0, 5).filter(function (t) { return paper.indexOf(t) > -1; }).length;
  ok("新试卷前 5 题中命中旧卷的题数：" + overlap + " / 5（同一题库，存在交集属正常）");

  await sleep(60);
  finish();
})();
