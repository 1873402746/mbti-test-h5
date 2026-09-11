# MBTI 16 型人格测试 H5 🧠

纯前端 MBTI 性格测试 H5：32 道题（四个维度各 8 题），输出 16 型人格结果 + 四维倾向百分比 + 倾向强度 + 结果一致性分析。
零依赖、零后端，题目与结果全部为静态 JSON，可直接发布到 GitHub Pages。

## 项目结构

```
mbti-test-h5/
├── index.html            # 页面骨架（封面 / 答题 / 分析中 / 结果报告）
├── css/style.css         # 移动端优先样式（375px 视口，无横向溢出）
├── js/app.js             # 全部逻辑：计分、维度分析、一致性、分享
└── data/
    ├── questions.json    # 32 道题（E/I、S/N、T/F、J/P 各 8 题，每题 2 选 1）
    ├── results.json      # 16 型人格（名称/标签/总结/优势/盲点/职业/关系匹配/配色）
    └── dimensions.json   # 8 个维度两极的解读文案
```

## 测试设计要点

- **32 题、每维度 8 题**：维度题量均衡，降低「某一维被放大」带来的偏差。
- **平局兜底**：8 题出现 4:4 时，按 `I / N / F / P` 兜底（见 `js/app.js` 的 `TIE_BREAK`），并在结果页提示「两个倾向非常接近」。
- **倾向强度**：按答案偏向幅度自动标注「非常明显 / 比较明显 / 轻微倾向 / 无明显倾向」。
- **结果一致性**：四个维度偏向幅度的平均值，输出「很高 / 中等 / 偏低」，提示是否处于变化期或本身就擅长切换。
- **四维解读**：结果页按各维度主导字母，展示该极的定义与关键词。

## 本地预览

因为使用 `fetch` 读取 JSON，需要通过 HTTP 访问（不要直接双击 index.html）：

```bash
npx serve mbti-test-h5
# 或
python -m http.server 8080 --directory mbti-test-h5
```

## 冒烟测试

`test/smoke-test.js` 用最小 DOM 桩在 Node 里跑完整流程（封面 → 32 题 → 结果页），
无需浏览器、无需安装任何依赖：

```bash
node test/smoke-test.js                        # 正常路径，校验结果页各区块
SMOKE_FAULT=groups       node test/smoke-test.js   # results.json 缺 groups（应降级且不报错）
SMOKE_FAULT=missing-type node test/smoke-test.js   # 结果库缺类型（应进入兜底页，不卡 loading）
SMOKE_FAULT=nodata       node test/smoke-test.js   # 数据加载失败（应提示改用 HTTP 打开）
```

> 改动 `js/app.js` 或 `data/*.json` 后建议先跑一遍，避免再次出现「结果页渲染异常导致一直卡在分析中」。

## 容错设计（为什么要跑上面的测试）

- 分析动画结束后，`renderResult()` 被 `try/catch` 包裹，**无论成功失败都会离开加载页**。
- 四维倾向图、维度解读、一致性分析**不依赖结果库**，先渲染；结果详情单独渲染，出问题只影响详情区块。
- 结果库缺少对应类型时，进入兜底页并保留已算出的四维分析，同时提示检查数据文件。

## 发布到 GitHub Pages

```bash
cd mbti-test-h5
git init
git add .
git commit -m "feat: mbti 16 personalities test h5"
git remote add origin https://github.com/<你的用户名>/mbti-test-h5.git
git push -u origin main
```

打开仓库 **Settings → Pages** → Source 选 `main` 分支 + `/ (root)` → 保存。约 1 分钟后访问
`https://<你的用户名>.github.io/mbti-test-h5/`。

> 发布后建议把 `js/app.js` 顶部的 `SITE_URL` 填成你的线上地址，分享文案会自动带上链接。

## 二次修改

- **改题目**：`data/questions.json`，每题 2 个选项，`score` 填该选项所属字母（E/I/S/N/T/F/J/P）；同题两个选项必须属于同一维度。
- **改结果文案**：`data/results.json`，16 个 `code` 需覆盖全部组合，否则会兜底显示 INTJ。
- **改维度解读**：`data/dimensions.json`，`poles` 需含全部 8 个字母。
- **改分享文案**：`data/results.json` 顶部 `shareTemplate`，支持 `{code}` `{name}` `{tagline}`。

## 说明与边界

- 本站为**非官方免费测试**，MBTI® 是 The Myers-Briggs Foundation 的商标，本页面与其无关联。
- 结果为自我报告的倾向性参考，**不构成心理诊断**，也不代表能力上限或职业限制。
- 未使用任何外部依赖、CDN、字体或统计脚本，全部数据在浏览器本地计算，不上传任何回答。
