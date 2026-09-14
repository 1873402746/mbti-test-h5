/* MBTI 16 型人格测试 · 纯前端，全部数据来自 /data/*.json */
(function () {
  "use strict";

  // 发布到 GitHub Pages 后，把这里换成你的站点地址，分享文案会自动带上
  var SITE_URL = "";

  var PAIRS = [
    { key: "EI", left: "E", right: "I", leftName: "外向", rightName: "内向" },
    { key: "SN", left: "S", right: "N", leftName: "实感", rightName: "直觉" },
    { key: "TF", left: "T", right: "F", leftName: "思考", rightName: "情感" },
    { key: "JP", left: "J", right: "P", leftName: "判断", rightName: "感知" }
  ];
  // 8 题一维度出现 4-4 平局时的兜底字母
  var TIE_BREAK = { EI: "I", SN: "N", TF: "F", JP: "P" };

  // bank = 完整题库；questions = 本次随机抽出的试卷
  var state = {
    bank: [], questions: [], perDim: 8,
    results: [], meta: {}, poles: {}, answers: [], index: 0
  };

  function $(id) { return document.getElementById(id); }

  var screens = {
    gate: $("screen-gate"), cover: $("screen-cover"), quiz: $("screen-quiz"),
    loading: $("screen-loading"), result: $("screen-result")
  };

  function show(name) {
    Object.keys(screens).forEach(function (k) { screens[k].classList.toggle("active", k === name); });
    window.scrollTo(0, 0);
  }

  // ---------- 前置验证码 ----------
  // 固定验证码：改这一行即可（长度自适应）
  var GATE_CODE = "1783";
  // 同一标签页会话内刷新是否免重复输入：true = 记住已通过
  var GATE_REMEMBER = false;
  var GATE_KEY = "mbti-gate-passed";
  var GATE_LEN = GATE_CODE.length;

  function gateRemembered() {
    if (!GATE_REMEMBER) return false;
    try { return sessionStorage.getItem(GATE_KEY) === "1"; } catch (e) { return false; }
  }

  function gateRemember() {
    if (!GATE_REMEMBER) return;
    try { sessionStorage.setItem(GATE_KEY, "1"); } catch (e) { /* 隐私模式下忽略 */ }
  }

  function initGate() {
    var inputs = [];
    for (var i = 0; i < GATE_LEN; i++) {
      var one = $("gateInput" + i);
      if (!one) break;                     // 以页面实际存在的输入框为准
      inputs.push(one);
    }
    var box = $("gateInputs"), errEl = $("gateError"), btn = $("gateBtn");
    if (!inputs.length || !box || !errEl || !btn) return;
    // 位数与输入框不一致时必须显式暴露，否则用户会永远卡在「验证码不正确」
    if (inputs.length !== GATE_LEN) {
      errEl.textContent = "验证码配置有误：index.html 需要 " + GATE_LEN + " 个输入框";
      if (window.console) console.error("[MBTI] GATE_CODE 为 " + GATE_LEN + " 位，页面输入框仅 " + inputs.length + " 个");
      return;
    }
    var LEN = inputs.length;

    function digits(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }
    function value() {
      return inputs.map(function (el) { return digits(el.value).slice(0, 1); }).join("");
    }
    function setError(msg) { errEl.textContent = msg || ""; }
    function focusAt(idx) { if (inputs[idx] && inputs[idx].focus) inputs[idx].focus(); }
    function clearAll() {
      inputs.forEach(function (el) { el.value = ""; el.classList.remove("filled"); });
      focusAt(0);
    }
    function shake() {
      box.classList.remove("shake");
      void box.offsetWidth;                // 强制重排，让动画可以连续重放
      box.classList.add("shake");
    }
    function submit() {
      var v = value();
      if (v.length < LEN) { setError("请输入完整的 " + LEN + " 位验证码"); shake(); return; }
      if (v === GATE_CODE) {
        setError("");
        gateRemember();
        show("cover");
        return;
      }
      setError("验证码不正确，请重新输入");
      shake();
      clearAll();
    }
    // 粘贴 / 输入整串：从 from 位置起逐格填充
    function fill(text, from) {
      var chars = digits(text).slice(0, LEN).split("");
      if (!chars.length) return;
      chars.forEach(function (c, k) {
        var el = inputs[from + k];
        if (!el) return;
        el.value = c;
        el.classList.add("filled");
      });
      focusAt(Math.min(from + chars.length, LEN - 1));
      setError("");
      if (value().length === LEN) setTimeout(submit, 180);
    }

    inputs.forEach(function (el, idx) {
      el.addEventListener("input", function () {
        el.value = digits(el.value).slice(0, 1);
        el.classList.toggle("filled", !!el.value);
        setError("");
        if (el.value && idx < LEN - 1) focusAt(idx + 1);
        if (value().length === LEN) setTimeout(submit, 180);
      });

      el.addEventListener("keydown", function (e) {
        var key = e.key;
        if (key === "Backspace" && !el.value && idx > 0) {
          if (e.preventDefault) e.preventDefault();
          inputs[idx - 1].value = "";
          inputs[idx - 1].classList.remove("filled");
          focusAt(idx - 1);
        } else if (key === "Enter") {
          submit();
        } else if (key === "ArrowLeft" && idx > 0) {
          focusAt(idx - 1);
        } else if (key === "ArrowRight" && idx < LEN - 1) {
          focusAt(idx + 1);
        }
      });

      // 支持整串粘贴（含空格、连字符等非数字字符会被清洗）
      el.addEventListener("paste", function (e) {
        var data = e.clipboardData || (typeof window !== "undefined" && window.clipboardData);
        if (!data || !data.getData) return;
        var txt = digits(data.getData("text"));
        if (!txt) return;
        if (e.preventDefault) e.preventDefault();
        fill(txt, idx);
      });

      el.addEventListener("focus", function () { if (el.select) el.select(); });
    });

    btn.addEventListener("click", submit);
    focusAt(0);
  }

  // ---------- 数据 ----------
  function fetchJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    });
  }

  function loadData() {
    Promise.all([
      fetchJSON("data/questions.json"),
      fetchJSON("data/results.json"),
      fetchJSON("data/dimensions.json")
    ]).then(function (res) {
      state.bank = res[0].questions;
      state.perDim = res[0].perDimension || 8;
      state.results = res[1].results;
      // groups / shareTemplate 在 results.json 里，不能整体拿 questions.json 当 meta
      state.meta = {
        title: res[0].title,
        bankSize: state.bank.length,
        groups: res[1].groups || {},
        shareTemplate: res[1].shareTemplate
      };
      res[2].poles.forEach(function (p) { state.poles[p.letter] = p; });
      $("startBtn").disabled = false;
      $("startBtn").textContent = "开始测试";
    }).catch(function (err) {
      $("startBtn").textContent = "数据加载失败，请用 HTTP 方式打开 😢";
      if (window.console) console.error("[MBTI] 数据加载失败：", err);
    });
  }

  // ---------- 随机抽题 ----------
  function shuffle(arr) {
    var a = (arr || []).slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 每个维度随机抽 perDim 题 → 打乱每题选项顺序 → 整卷题目顺序再打乱
  function buildPaper() {
    var per = state.perDim || 8;
    var picked = [];
    PAIRS.forEach(function (p) {
      var pool = state.bank.filter(function (q) { return q.dim === p.key; });
      if (!pool.length) return;
      shuffle(pool).slice(0, per).forEach(function (q) {
        picked.push({ id: q.id, dim: q.dim, text: q.text, options: shuffle(q.options) });
      });
    });
    return shuffle(picked);
  }

  // ---------- 答题 ----------
  function startQuiz() {
    state.questions = buildPaper();
    // 题库为空时不能进入答题页，否则 renderQuestion 会崩
    if (!state.questions.length) {
      $("startBtn").textContent = "题库为空，请检查 data/questions.json";
      show("cover");
      return;
    }
    state.answers = [];
    state.index = 0;
    renderQuestion();
    show("quiz");
  }

  function renderQuestion() {
    var q = state.questions[state.index];
    var total = state.questions.length;

    $("quizCount").textContent = (state.index + 1) + " / " + total;
    $("progressBar").style.width = (state.index / total) * 100 + "%";
    // 每次随机组卷，题目在题库中的 id 与答题顺序无关，这里用当前序号
    $("quizDim").textContent = "第 " + (state.index + 1) + " 题";
    $("quizText").textContent = q.text;
    $("backBtn").style.visibility = state.index === 0 ? "hidden" : "visible";

    var box = $("quizOptions");
    box.innerHTML = "";
    q.options.forEach(function (opt, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.textContent = opt.text;
      if (state.answers[state.index] === i) btn.classList.add("picked");
      btn.addEventListener("click", function () {
        state.answers[state.index] = i;
        box.querySelectorAll(".option").forEach(function (b) { b.disabled = true; });
        btn.classList.add("picked");
        setTimeout(next, 240);
      });
      box.appendChild(btn);
    });
  }

  function next() {
    if (state.index < state.questions.length - 1) {
      state.index += 1;
      renderQuestion();
    } else {
      $("progressBar").style.width = "100%";
      analyze();
    }
  }

  // ---------- 计分（加权：强烈选项 2 分，轻微选项 1 分）----------
  function tally() {
    var scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
    state.questions.forEach(function (q, i) {
      var ai = state.answers[i];
      if (ai === undefined) return;
      var opt = q.options[ai];
      if (!opt) return;
      scores[opt.score] += (opt.weight || 1);
    });
    return scores;
  }

  function summarize(scores) {
    var dims = PAIRS.map(function (p) {
      var l = scores[p.left], r = scores[p.right], sum = l + r;
      var lPct = sum ? Math.round((l / sum) * 100) : 50;
      var rPct = 100 - lPct;
      var winner = l === r ? null : (l > r ? p.left : p.right);
      var chosen = winner || TIE_BREAK[p.key];
      var margin = Math.abs(lPct - 50);           // 0 ~ 50
      var strength = margin === 0 ? "无明显倾向" : (margin >= 37 ? "非常明显" : margin >= 25 ? "比较明显" : "轻微倾向");
      return {
        key: p.key, left: p.left, right: p.right,
        leftName: p.leftName, rightName: p.rightName,
        leftPct: lPct, rightPct: rPct, winner: winner, chosen: chosen,
        margin: margin, strength: strength
      };
    });
    var code = dims.map(function (d) { return d.chosen; }).join("");
    var avg = dims.reduce(function (a, d) { return a + d.margin; }, 0) / dims.length;
    return { dims: dims, code: code, avgMargin: avg };
  }

  // ---------- 分析动画 ----------
  var MSGS = ["正在计算四维倾向…", "正在比对 16 型人格特征…", "正在生成你的优势与盲点…"];

  function analyze() {
    show("loading");
    var i = 0;
    $("loadingText").textContent = MSGS[0];
    var timer = setInterval(function () {
      i += 1;
      if (i < MSGS.length) { $("loadingText").textContent = MSGS[i]; return; }
      clearInterval(timer);
      // 无论渲染成功与否都必须离开 loading 页，否则用户会卡死在这里
      try {
        renderResult();
      } catch (err) {
        renderFallback(err);
      }
      show("result");
    }, 620);
  }

  // ---------- 结果渲染 ----------
  function renderResult() {
    var s = summarize(tally());

    // ① 与结果库无关的部分先渲染，即使详情数据有问题也不会整页空白
    renderDimBars(s);
    renderDimExplain(s);
    renderConsistency(s);

    // ② 结果详情
    var r = state.results.find(function (x) { return x.code === s.code; });
    if (!r) throw new Error("data/results.json 中缺少 " + s.code + " 类型");

    renderProfile(s, r);
  }

  function renderDimBars(s) {
    var bars = $("dimBars");
    bars.innerHTML = "";
    s.dims.forEach(function (d) {
      var leftDom = d.winner === d.left ? " dominant" : "";
      var rightDom = d.winner === d.right ? " dominant" : "";
      var row = document.createElement("div");
      row.className = "dim";
      row.innerHTML =
        '<div class="dim-head">' +
          '<span class="dim-side' + leftDom + '">' + d.leftName + " " + d.left + " <b>" + d.leftPct + '%</b></span>' +
          '<span class="dim-side' + rightDom + '">' + d.rightName + " " + d.right + " <b>" + d.rightPct + '%</b></span>' +
        '</div>' +
        '<div class="dim-track"><div class="dim-fill" style="width:0"></div></div>';
      bars.appendChild(row);
      var fill = row.querySelector(".dim-fill");
      setTimeout(function () { fill.style.width = d.leftPct + "%"; }, 60);
    });

    var weak = s.dims.filter(function (d) { return d.margin <= 12.5; });
    var note = weak.length
      ? "其中 " + weak.map(function (d) { return d.leftName + "/" + d.rightName; }).join("、") +
        " 两个倾向非常接近，说明你在这一维度上更灵活，会根据场景切换，不必强行归到某一极。"
      : "四个维度的倾向都比较清楚，说明你的人格偏好相对稳定。";
    $("dimNote").textContent = "填写说明：百分比为你在该维度两极上的加权得分占比（选「强烈」计 2 分、「轻微」计 1 分）。" + note;
  }

  function renderDimExplain(s) {
    var ex = $("dimExplain");
    ex.innerHTML = "";
    s.dims.forEach(function (d) {
      var p = state.poles[d.chosen];
      if (!p) return;
      var box = document.createElement("div");
      box.className = "pole";
      box.innerHTML =
        '<div class="pole-top">' +
          '<span class="pole-letter">' + p.letter + '</span>' +
          '<span class="pole-name">' + p.name + '</span>' +
          '<span class="pole-keywords">' + p.keywords.join(" · ") + '</span>' +
        '</div>' +
        '<p class="pole-desc">' + p.desc + '</p>';
      ex.appendChild(box);
    });
  }

  function renderConsistency(s) {
    var confPct = Math.round((s.avgMargin / 50) * 100);
    var level = s.avgMargin >= 35 ? "很高" : s.avgMargin >= 20 ? "中等" : "偏低";
    $("confLabel").textContent = "一致性：" + level;
    setTimeout(function () { $("confFill").style.width = confPct + "%"; }, 80);
    $("confNote").textContent = "计算公式：四个维度答案偏向的平均幅度（" + Math.round(s.avgMargin * 2) +
      "% 满幅）。数值越高说明作答越明确；偏低通常意味着你正处于变化期，或本就更擅长在不同场合切换。" +
      "本次题目从 " + (state.meta.bankSize || 64) + " 题题库中随机抽取，间隔一段时间重测几次，结果会更接近你的真实倾向。";
  }

  function renderProfile(s, r) {
    var groups = state.meta.groups || {};
    var group = groups[r.group] || { label: "" };

    if (r.gradient && r.gradient.length === 2) {
      $("resultHead").style.setProperty("--head-bg",
        "linear-gradient(160deg, " + r.gradient[0] + ", " + r.gradient[1] + ")");
    }
    $("resultCode").textContent = r.code;
    $("resultName").textContent = r.emoji + " " + r.name + (group.label ? " · " + group.label : "");
    $("resultEn").textContent = r.enName || "";
    $("resultTags").innerHTML = (r.tags || []).map(function (t) { return "<span>" + t + "</span>"; }).join("");
    $("resultTagline").textContent = "「" + r.tagline + "」";
    $("resultSummary").textContent = r.summary;

    function list(items) {
      return (items || []).map(function (t) { return "<li>" + t + "</li>"; }).join("");
    }
    $("resultStrengths").innerHTML = list(r.strengths);
    $("resultBlindspots").innerHTML = list(r.blindspots);
    $("resultCareers").innerHTML = (r.careers || []).map(function (t) { return "<span>" + t + "</span>"; }).join("");

    function label(code) {
      var x = state.results.find(function (t) { return t.code === code; });
      return x ? x.emoji + " " + x.code + "｜" + x.name : code;
    }
    $("matchBest").textContent = label(r.bestMatch);
    $("matchGrowth").textContent = label(r.growthMatch);

    var tpl = state.meta.shareTemplate || "我的 MBTI 是 {code}｜{name}";
    window.__shareText = tpl
      .replace("{code}", r.code).replace("{name}", r.name)
      .replace("{tagline}", r.tagline)
      + (SITE_URL ? "\n" + SITE_URL : "");
  }

  // 结果详情渲染失败时的兜底：保留能算出来的四维分析，明确说明问题
  function renderFallback(err) {
    if (window.console) console.error("[MBTI] 结果渲染失败：", err);
    var s = summarize(tally());
    try {
      renderDimBars(s);
      renderDimExplain(s);
      renderConsistency(s);
    } catch (e) { /* 兜底里再出错就只能放弃了 */ }

    $("resultCode").textContent = s.code;
    $("resultName").textContent = "结果详情暂时无法显示";
    $("resultEn").textContent = "";
    $("resultTags").innerHTML = "<span>可截图反馈</span>";
    $("resultTagline").textContent = "";
    $("resultSummary").textContent = "你的四维倾向已经算出，上方图表可正常参考；但人格详情渲染失败：" +
      (err && err.message ? err.message : String(err)) +
      "。请检查 data/results.json 与 data/dimensions.json 是否完整。";
    $("resultStrengths").innerHTML = "";
    $("resultBlindspots").innerHTML = "";
    $("resultCareers").innerHTML = "";
    $("matchBest").textContent = "—";
    $("matchGrowth").textContent = "—";
    window.__shareText = "我的 MBTI 倾向：" + s.code;
  }

  // ---------- 事件 ----------
  $("startBtn").addEventListener("click", startQuiz);
  $("retryBtn").addEventListener("click", startQuiz);
  $("backBtn").addEventListener("click", function () {
    if (state.index > 0) { state.index -= 1; renderQuestion(); }
  });

  $("copyBtn").addEventListener("click", function () {
    var text = window.__shareText || "来测测你的 MBTI 是哪一型";
    function done() {
      var tip = $("copyTip");
      tip.classList.add("show");
      setTimeout(function () { tip.classList.remove("show"); }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) { /* noop */ }
      document.body.removeChild(ta);
      done();
    }
  });

  // 全局错误可见化：出问题时在控制台留痕，方便排查
  if (window.addEventListener) {
    window.addEventListener("error", function (e) {
      if (window.console) console.error("[MBTI] 运行时错误：", e && (e.message || e));
    });
  }

  initGate();
  // 开启 GATE_REMEMBER 时，刷新可跳过验证码
  if (gateRemembered()) show("cover");
  loadData();
})();
