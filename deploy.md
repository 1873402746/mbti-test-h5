# 发布指南（TortoiseGit 小乌龟 + 命令行）

> 本机环境：Git for Windows 2.38.1（`D:\Git`）、TortoiseGit（`C:\Program Files\TortoiseGit`）
> 仓库状态：已 `git init`，已有首个提交，远端 `origin` = `https://github.com/1873402746/mbti-test-h5.git`

---

## 零、推送前必读：本机的网络与凭据（已配置好）

2026-09-11 实测确认了两件事，**推不上去基本都栽在这两点上**：

| 事实 | 说明 |
|---|---|
| 本机直连 `github.com:443` **时通时不通** | 通的时候直连就能推（2026-09-14 实测 2 秒直推成功）；不通时报 `Timed out`，此时需走本地代理 `http://127.0.0.1:7890` |
| 系统级凭据助手是 TortoiseGit 的 `helper-selector` | 它在命令行/脚本场景会弹选择框，导致**无限卡住**（不报错、不退出） |

另外，Windows 凭据管理器里**已经存有** `git:https://github.com` 凭据（由 TortoiseGit 保存），用 git 自带的 `wincred` 助手可以直接读取，无需重新登录。

### 本仓库已固化以下配置（仓库级，不影响其他项目）

```
http.proxy        = http://127.0.0.1:7890
https.proxy       = http://127.0.0.1:7890
credential.helper = wincred
```

配好之后，在这个仓库里 `git push` / `git pull` 以及小乌龟推送都会**自动走代理 + 复用已存凭据**。

### ⚠️ 代理工具没开时会直接失败（2026-09-14 实测）

仓库级代理是**硬配置**：代理工具没开时，git 连 `127.0.0.1:7890` 都连不上，报

```
fatal: unable to access '...': Failed to connect to github.com:443 over proxy 127.0.0.1
after 2073 ms: Could not connect to server
```

这**不是 GitHub 的问题**，是本机代理端口没人监听。先确认：

```bash
netstat -ano | grep ":7890" | grep -i listening
```

- **有输出** → 代理开着，直接 `git push origin main`
- **没输出** → 二选一：① 打开代理工具再推（推荐，配置不用改）；② 临时绕过代理走直连（本机直连有时完全可用）：

```bash
cd "D:/workBuddyWorking/2026-09-11-08-49-19/mbti-test-h5"
git -c http.proxy= -c https.proxy= push origin main
```

查看当前配置：
```bash
cd "D:/workBuddyWorking/2026-09-11-08-49-19/mbti-test-h5"
git config --local --list | grep -E "proxy|credential"
```

### 手动推送（一行，无弹窗）

```bash
cd "D:/workBuddyWorking/2026-09-11-08-49-19/mbti-test-h5"
git push origin main
```

### 如果换了机器、或配置被清掉，用临时参数写法

```bash
git -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 \
    -c credential.helper= -c credential.helper=wincred push origin main
```

> **代理端口变了怎么办**：换代理工具或改设置后端口可能不是 7890。
> 查正在监听的端口：`netstat -ano | findstr LISTENING | findstr 127.0.0.1`
> 确认后同步：`git config --local http.proxy http://127.0.0.1:<新端口>`（`https.proxy` 同样改一遍）

---

## 一、用 TortoiseGit（小乌龟）推送

### 0. 两个一次性设置（建议先做）

**① 切成中文界面**
右键任意空白处 → `TortoiseGit` → `Settings` → `General` → `Language` 选 **中文(简体)** → 应用。
（TortoiseGit 已自带 2052 简体中文资源，无需额外下载语言包）

**② 填对提交署名（重要）**
同上进入 `Settings` → `Git`：
- 用户名：你的 GitHub 用户名
- 邮箱：你的 GitHub 邮箱

> 若留空或填错，提交不会出现在 GitHub 主页的贡献图上。命令行等价写法：
> ```bash
> git config --global user.name "你的GitHub用户名"
> git config --global user.email "你的GitHub邮箱"
> ```

### 1. 打开仓库根目录
进入文件夹（**仓库根**，里面有 `.git`）：

```
D:\workBuddyWorking\2026-09-11-08-49-19\mbti-test-h5
```

### 2. 右键 → Git 同步
在文件夹**空白处右键** → **Git 同步 (Git Sync...)**
（Windows 11 需要先点一下「显示更多选项」，或在文件夹内按住 Shift 右键）

### 3. 在同步窗口点「推送」
同步对话框里核对：
- 左上 `远端 (Remote)` 下拉 = **origin**
- `URL` = `https://github.com/1873402746/mbti-test-h5.git`

点 **推送 (Push)** 按钮。

> 也可以走另一个入口：右键 → `TortoiseGit` → `推送 (Push...)`，在弹窗里「远端」选 `origin` → 确定。

### 4. 首次认证
第一次推送会弹出认证流程：
1. 先弹「选择凭据助手」→ 选 **manager / manager-core**
2. 弹出 GitHub 登录窗口 → 用浏览器登录授权（推荐）

如果弹的是传统的用户名/密码输入框：**密码栏必须填 Personal Access Token（PAT）**，GitHub 早已停用账号密码推送。
生成 PAT：GitHub → 右上头像 → `Settings` → `Developer settings` → `Personal access tokens` → `Tokens (classic)` → `Generate new token`，勾选 **repo** 权限，复制生成的一串字符当密码用（只显示一次，记得保存）。

### 5. 确认结果
进度窗口出现 `Success` 即推送完成。刷新
`https://github.com/1873402746/mbti-test-h5` 应能看到 `index.html`、`data/`、`css/`、`js/`。

### 6. 之后每次改完代码怎么推
1. 文件夹上右键 → **Git 提交 -> "main"**
2. 勾选要提交的文件、写提交信息
3. 点 **提交并推送 (Commit & Push)** —— 一步到位
   （或先「提交」，再用「Git 同步 → 推送」）

---

## 二、开启 GitHub Pages

1. 仓库页 → **Settings** → 左侧 **Pages**
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，目录选 **`/ (root)`** → **Save**
4. 等 1–2 分钟，访问：

```
https://1873402746.github.io/mbti-test-h5/
```

> 这个地址就是可以分享出去的线上链接。仓库根目录有 `index.html`，静态站点无需任何构建。

发布后把 `js/app.js` 顶部的 `var SITE_URL = "";` 改成上面的地址，分享文案会自动带上链接。

---

## 三、常见报错对照

| 现象 | 原因 | 处理 |
|---|---|---|
| `Couldn't find git.exe` | 小乌龟找不到 Git | Settings → General → `Git.exe path` 填 `D:\Git\cmd\git.exe` |
| `Authentication failed` | 用了账号密码，或登错账号 | 改用 PAT；注意本机还配过自建仓库凭据，别串号 |
| `Updates were rejected` / `non-fast-forward` | 远端有你本地没有的提交 | 先「Git 同步 → 拉取(Pull)」，再推送 |
| `remote origin already exists` | 已配过远端 | 无需重复添加；要改地址用 `git remote set-url origin <新地址>` |
| 推送超时 `Failed to connect to github.com port 443 ... Timed out` | 本机**直连** GitHub 不通 | 必须走本地代理：`git config --local http.proxy http://127.0.0.1:7890`，`https.proxy` 同样设一遍 |
| 推送**没有任何输出、一直不动**（不报错也不退出） | 系统级凭据助手 `helper-selector` 在等交互弹窗 | 换 wincred：先 `git config --local --replace-all credential.helper ""`，再 `git config --local --add credential.helper wincred` |
| TortoiseGit 里拉取/推送报 443 超时 | 小乌龟没走代理 | 同上配好仓库级代理后重试（小乌龟会读仓库 git 配置） |
| 右键菜单没有 TortoiseGit 项 | 资源管理器未加载 | 重启资源管理器；确认真在仓库根目录（含 `.git`） |

---

## 四、命令行等价做法（备查）

```bash
cd /d D:\workBuddyWorking\2026-09-11-08-49-19\mbti-test-h5

git add -A
git commit -m "更新说明"
git push -u origin main
```

---

## 五、一条安全提醒

本机全局 git 配置里存在：

```
http.sslverify=false
```

它会对**所有** HTTPS 仓库关闭证书校验（包含 GitHub），相当于放弃了中间人攻击防护。建议移除全局设置，只在确实需要的自建仓库单独关闭：

```bash
git config --global --unset http.sslverify
# 如自建仓库确需关闭，只针对该域名：
git config --global http.https://git.jxtuoyue.com/.sslverify false
```
