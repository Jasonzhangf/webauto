# WebAuto Windows 移植最小测试清单

> 本文档是 Windows 平台移植与验证的最小检查项，按依赖顺序排列。
> 每项通过后才进入下一项；任何 FAIL 必须立即修复后再继续。

## 一键命令

```powershell
node scripts/test/webauto-smoke.mjs --profile xhs-qa-1
```

> smoke 脚本本身已做跨平台兼容（纯 Node.js，无 shell 依赖），可直接在 Windows PowerShell 中运行。

---

## Phase 0 — 环境与依赖（无 camo 需求）

| # | 检查项 | 验证方法 | 预期 | PASS 判定 |
|---|--------|---------|------|----------|
| 0.1 | Node.js 版本 ≥ 20 | `node --version` | `v20.x` 或 `v22.x` | major ≥ 20 |
| 0.2 | npm 可用 | `npm --version` | 正常输出版本号 | exit 0 |
| 0.3 | @web-auto/camo 版本兼容 | smoke Phase 0 | `vX.Y.Z` + engine check pass | 无 FAIL |
| 0.4 | camo bin 文件存在 | smoke Phase 0 | `camo` / `camoufox-cli` bin 存在 | 存在 |
| 0.5 | 关键运行时 deps | smoke Phase 0 | `ajv` / `iconv-lite` / `minimist` | 全部 installed |
| 0.6 | camo-runtime vendor 目录 | smoke Phase 0 | `modules/camo-runtime/src/autoscript/` 存在 | 存在 |
| 0.7 | XHS action provider 文件 | smoke Phase 0 | 5个 `.mjs` 文件全存在 | 全部存在 |

### Windows 特别关注
- `camo-env.mjs` 已实现 `path.win32` / `path.posix` 自动切换
- Data root 优先 `D:\webauto`，fallback `%USERPROFILE%\.webauto`
- 无 `/home/` 硬编码路径

---

## Phase 1 — Camo Runtime 连通性

| # | 检查项 | 验证方法 | 预期 | PASS 判定 |
|---|--------|---------|------|----------|
| 1.1 | health 端口 `:7704` | smoke Phase 1 | HTTP 200 | ok=true |
| 1.2 | health 端口 `:7701` | `curl http://127.0.0.1:7701/health` (或 PowerShell `Invoke-WebRequest`) | HTTP 200 | ok=true |
| 1.3 | evaluate 命令 | smoke Phase 1 | `result=2` | ok + result=2 |
| 1.4 | screenshot 命令 | smoke Phase 1 | base64 长度 > 1000 bytes | ok + size>1000 |
| 1.5 | mouse:click 命令 | smoke Phase 1 | 无报错 | ok=true |
| 1.6 | keyboard:press 命令 | smoke Phase 1 | 无报错 | ok=true |

### Windows 特别关注
- daemon IPC 使用 Named Pipe (`\\.\pipe\webauto-daemon`) 而非 Unix Socket
- 确认 Named Pipe 创建和连接无权限问题

---

## Phase 2 — Daemon 生命周期

| # | 检查项 | 验证方法 | 预期 | PASS 判定 |
|---|--------|---------|------|----------|
| 2.1 | daemon start | `node bin/webauto.mjs daemon start` | 启动成功，输出 PID | exit 0 |
| 2.2 | daemon status | `node bin/webauto.mjs daemon status --json` | `"status":"running"` | JSON 解析正常 |
| 2.3 | Named Pipe IPC | daemon status 走 pipe 通信 | 正常返回 | 无 ECONNREFUSED |
| 2.4 | daemon stop | `node bin/webauto.mjs daemon stop` | 优雅停止 | exit 0 |
| 2.5 | PID 文件清理 | 检查 `run/webauto-daemon.pid` | stop 后 PID 文件移除或进程已死 | 无僵尸 |
| 2.6 | Windows Session 0 检测 | Session 0 环境下启动 | 应拒绝并提示 | 拒绝 + 明确提示 |

### Windows 特别关注
- `SIGTERM` 在 Windows 上通过 `process.kill(pid, 'SIGTERM')` 发送
- 确认子进程树清理（`child.kill` 在 Windows 上工作正常）
- Named Pipe 路径: `\\.\pipe\webauto-daemon`
- 无 `pkill`/`killall` 调用（已禁止）

---

## Phase 3 — 任务派发与状态

| # | 检查项 | 验证方法 | 预期 | PASS 判定 |
|---|--------|---------|------|----------|
| 3.1 | task submit (dry-run) | `node bin/webauto.mjs daemon relay --detach -- xhs unified --profile xhs-qa-1 --keyword "测试" --max-notes 1 --dry-run --env debug --json` | 成功提交，返回 jobId | exit 0 + jobId |
| 3.2 | task status | `node bin/webauto.mjs daemon task status --job-id <jobId> --json` | 返回 status 字段 | JSON 正常 |
| 3.3 | task stop | `node bin/webauto.mjs daemon task stop --job-id <jobId> --json` 或 API | 成功停止 | exit 0 |

### Windows 特别关注
- `webauto.mjs` 使用 `spawn` + `npm.cmd` wrapper（Windows 适配）
- 确认 `powershell.exe` 路径可用（Session ID 检测依赖）

---

## Phase 4 — XHS 模块加载

| # | 检查项 | 验证方法 | 预期 | PASS 判定 |
|---|--------|---------|------|----------|
| 4.1 | dom-ops 加载 | smoke Phase 2 | 无报错 | ok |
| 4.2 | comments-ops 加载 | smoke Phase 2 | 无报错 | ok |
| 4.3 | harvest-ops 加载 | smoke Phase 2 | 无报错 | ok |
| 4.4 | detail-flow-ops 加载 | smoke Phase 2 | 无报错 | ok |
| 4.5 | diagnostic-utils 加载 | smoke Phase 2 | 无报错 | ok |
| 4.6 | xhs-unified-options 加载 | smoke Phase 2 | 无报错 | ok |

---

## Phase 5 — Feed-like 分层 Block 配置

| # | 检查项 | 验证方法 | 预期 | PASS 判定 |
|---|--------|---------|------|----------|
| 5.1 | template 构建 | smoke Phase 4 | `buildXhsFeedLikeAutoscript` 返回有效 script | 无异常 |
| 5.2 | feed_like_round operation | smoke Phase 4 | operation 存在 | id='feed_like_round' |
| 5.3 | keywords 截断 max=4 | smoke Phase 4 | 传入5个→只保留前4 | length=4 |
| 5.4 | keywords 顺序保持 | smoke Phase 4 | 前4个不变 | 顺序正确 |
| 5.5 | likesPerRound 映射 | smoke Phase 4 | maxLikesPerTab=5 → likesPerRound=5 | 5 |
| 5.6 | finish 依赖链 | smoke Phase 4 | dependsOn 包含 feed_like_round | 依赖正确 |
| 5.7 | action 注册 | smoke Phase 4 | xhs_feed_like + xhs_feed_like_tab_switch | 两个都是 function |

---

## Phase 6 — XHS 页面上下文（需 camo + 已登录 profile）

| # | 检查项 | 验证方法 | 预期 | PASS 判定 |
|---|--------|---------|------|----------|
| 6.1 | xhs host 检测 | smoke Phase 3 | `location.hostname` 含 xiaohongshu.com | onXhs=true |
| 6.2 | 页面上下文 | smoke Phase 3 | feed 或 detail 页面 | hasFeed 或 hasDetail |
| 6.3 | comment-item selector | smoke Phase 3 | count > 0（需先打开帖子详情） | count≥1 |
| 6.4 | like-wrapper selector | smoke Phase 3 | count > 0 | count≥1 |
| 6.5 | like-lottie selector | smoke Phase 3 | count > 0 | count≥1 |
| 6.6 | like-target 检测 | smoke Phase 3 | 第一个评论下找到点赞目标 | found=true |
| 6.7 | liked 状态读取 | smoke Phase 3 | 返回 liked=true/false | 状态可读 |

### Windows 特别关注
- evaluate 脚本中无平台特定逻辑（纯 DOM 操作），预期行为一致
- screenshot 在 Windows 上输出 base64 应与 macOS 一致

---

## Phase 7 — Camoufox 浏览器安装

| # | 检查项 | 验证方法 | 预期 | PASS 判定 |
|---|--------|---------|------|----------|
| 7.1 | camoufox 安装 | `node bin/webauto.mjs xhs install --download-geoip --ensure-backend` | 安装成功 | exit 0 |
| 7.2 | camoufox.exe 存在 | 检查 data root 下 `camoufox.exe` | 文件存在 | exists |
| 7.3 | camo init | `camo init` | 初始化成功 | exit 0 |
| 7.4 | camo start | `camo start <profile> --url https://www.xiaohongshu.com` | 浏览器启动 | exit 0 |
| 7.5 | camo status | `camo status <profile>` | 返回状态 | JSON 正常 |
| 7.6 | camo stop | `camo stop <profile>` | 浏览器关闭 | exit 0 |

### Windows 特别关注
- `xhs-install.mjs` 在 Windows 上使用 `powershell.exe` 执行安装命令
- `camoufox.exe` 路径使用 `path.win32.join`
- 确认 `.exe` 二进制有执行权限（Windows 默认无权限位问题）

---

## Windows 已知适配点（无需测试，供参考）

以下代码已做 Windows 适配，移植时无需额外处理：

| 适配项 | 文件 | 说明 |
|--------|------|------|
| Daemon IPC | `daemon.mjs:70` | win32 → Named Pipe, else → Unix Socket |
| 路径处理 | `camo-env.mjs` | `path.win32` / `path.posix` 自动切换 |
| Data root | `camo-env.mjs` | win32 → `D:\webauto` 或 `%USERPROFILE%\.webauto` |
| npm 命令 | `webauto.mjs:291` | win32 → `npm.cmd` wrapper |
| Session 0 检测 | `webauto.mjs:16-35` | PowerShell 查询 Win32_Process |
| 进程清理 | `webauto.mjs:143` | Session 0 时拒绝启动 |
| camoufox.exe | `xhs-install.mjs:89` | win32 后缀 `.exe` |
| 子进程退出码 | `webauto.mjs:616` | 0xC0000409 (stack buffer overflow) 特殊处理 |

---

## 快速判定

```powershell
# 运行全部 smoke 测试
node scripts/test/webauto-smoke.mjs --profile xhs-qa-1

# 预期输出末尾：
# Results: N passed / 0 failed / M skipped / T total
# FAIL=0 即通过
```

**全部 Phase 0-5 通过 = 基础移植成功**
**Phase 6-7 通过 = 完整功能可用**
