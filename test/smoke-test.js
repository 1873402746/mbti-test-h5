/**
 * 冒烟测试：在 Node 里用最小 DOM 桩跑完整「封面 → 32 题 → 结果」流程，
 * 用来兜住「结果页渲染抛异常导致卡在 loading」这类问题。
 *
 * 用法：
 *   node test/smoke-test.js                     # 正常路径
 *   SMOKE_FAULT=groups      node test/smoke-test.js   # results.json 缺 groups 字段（应降级但正常出结果）
 *   SMOKE_FAULT=missing-type node test/smoke-test.js  # 结果库缺某个类型（应出兜底页，不卡 loading）
 *   SMOKE_FAULT=nodata      node test/smoke-test.js   # 数据加载失败（应提示用 HTTP 打开）
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const FAULT = process.env.SMOKE_FAULT || "";
const errors = [];

/* ---------- 最小 DOM 桩 ---------- */
const elCache = {};
const created = [];

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
      // 移除一个类型，模拟「结果库不全」
      json.results = json.results.filter(function (x) { return x.code !== "ESTJ"; });
    }
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(json); } });
  } catch (e) {
    return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve(null); } });
  }
}

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

(async function main() {
  console.log("冒烟测试开始" + (FAULT ? "（故障注入：" + FAULT + "）" : "") + "\n");

  await sleep(60);
  const startBtn = document_.getElementById("startBtn");

  if (FAULT === "nodata") {
    if (startBtn.textContent.indexOf("数据加载失败") > -1) ok("数据加载失败时给出明确提示：" + startBtn.textContent);
    else bad("数据加载失败未提示，文案：" + JSON.stringify(startBtn.textContent));
    return finish();
  }

  if (startBtn.textContent.indexOf("开始测试") === 0) ok("数据加载成功，开始按钮就绪");
  else bad("开始按钮未就绪，文案：" + JSON.stringify(startBtn.textContent));

  // 点击开始（先记录按钮基线，避免漏掉第一题的选项按钮）
  const createdBefore = created.length;
  startBtn._handlers.click();
  await sleep(30);
  ok("进入答题页，首题已渲染：" + JSON.stringify(document_.getElementById("quizText").textContent.slice(0, 16) + "…"));

  // 32 题：按固定模式作答（约 2/3 选 A、1/3 选 B），确保覆盖真实点击链路
  let answered = 0;
  for (let i = 0; i < 32; i++) {
    const btns = created.slice(createdBefore).filter(function (e) { return e.tag === "button"; });
    if (btns.length < 2 * (i + 1)) { bad("第 " + (i + 1) + " 题未渲染出两个选项"); break; }
    const pair = btns.slice(-2);
    pair[i % 3 === 2 ? 1 : 0]._handlers.click();
    answered++;
    await sleep(280);
  }
  ok("完成 " + answered + " 题作答，进度条 " + document_.getElementById("progressBar").style.width);

  // 等分析动画（3 条 × 620ms）
  await sleep(2200);

  // —— 故障注入场景：必须落在兜底页，不能停留在 loading ——
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

  const codeText = document_.getElementById("resultCode").textContent;
  if (/^[EI][SN][TF][JP]$/.test(codeText)) ok("类型码正常输出：" + codeText);
  else bad("类型码异常：" + JSON.stringify(codeText));

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

  const dimBars = document_.getElementById("dimBars").children.length;
  if (dimBars === 4) ok("四维倾向条渲染 4 组");
  else bad("四维倾向条数量异常：" + dimBars);

  const conf = document_.getElementById("confLabel").textContent;
  if (conf.indexOf("一致性") > -1) ok("一致性分析输出：" + conf);
  else bad("一致性未输出");

  if (typeof ctx.window.__shareText === "string" && ctx.window.__shareText.length > 5) {
    ok("分享文案已生成：" + ctx.window.__shareText.split("\n")[0]);
  } else bad("分享文案未生成");

  // 复制按钮不应报错
  try {
    document_.getElementById("copyBtn")._handlers.click();
    ok("复制按钮无异常");
  } catch (e) { bad("复制按钮报错：" + e.message); }

  // 回退与重测
  try {
    document_.getElementById("backBtn")._handlers.click();
    document_.getElementById("retryBtn")._handlers.click();
    ok("上一题 / 重新测试按钮无异常");
  } catch (e) { bad("重测按钮报错：" + e.message); }

  await sleep(120);
  finish();
})();
