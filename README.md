# @web-auto/webauto

Windows 优先的 WebAuto CLI + Desktop UI 使用说明（面向直接安装使用）。

## 1. 安装

要求：
- Node.js 18+（建议 20+）
- npm 可用

```bat
npm install -g @web-auto/webauto
webauto --help
```

## 2. 首次启动（推荐路径）

直接启动 UI：

```bat
webauto ui console
```

也可以用 UI CLI 自动拉起（适合脚本/远程）：

```bat
webauto ui cli start --json
webauto ui cli status --json
```

说明：
- `webauto` 默认会自动设置运行根目录，不需要手工设置 `WEBAUTO_REPO_ROOT`。
- 首次运行会按需准备运行依赖（Electron/服务进程）。

## 3. Windows 默认目录规则

未设置环境变量时：
- 如果存在 `D:` 盘：默认使用 `D:\webauto`
- 否则：默认使用 `%USERPROFILE%\.webauto`

可选覆盖（仅在你需要自定义目录时）：
- `WEBAUTO_HOME`（推荐）
- `WEBAUTO_ROOT` / `WEBAUTO_PORTABLE_ROOT`（兼容旧变量）

PowerShell 示例：

```powershell
$env:WEBAUTO_HOME = 'E:\my-webauto'
webauto ui console
```

CMD 示例：

```bat
set WEBAUTO_HOME=E:\my-webauto
webauto ui console
```

## 4. UI 常用流程（推荐人机流程）

1. 启动 UI：`webauto ui console`
2. 在任务页填写关键词、目标数、账号等参数
3. 点“保存并执行”或“执行”
4. 用 UI CLI 查询当前状态（可选）

```bat
webauto ui cli status --json
webauto xhs status --json
```

说明：
- `ui cli status`：轻量健康/状态查询（适合轮询）
- `ui cli snapshot`：完整 UI 快照（字段更全，开销更大）

## 5. UI CLI 操作示例（模拟真实 UI 操作）

```bat
:: 启动并确认 UI
webauto ui cli start --json
webauto ui cli status --json

:: 切到任务 tab
webauto ui cli tab --tab tasks --json

:: 输入参数
webauto ui cli input --selector "#task-keyword" --value "deepseek" --json
webauto ui cli input --selector "#task-target" --value "20" --json

:: 触发执行（按你的页面按钮 selector）
webauto ui cli click --selector "#task-run-btn" --json

:: 等待 runId 出现
webauto ui cli wait --selector "#run-id-text" --state exists --timeout 20000 --json

:: 取轻量状态 / 完整快照
webauto ui cli status --json
webauto ui cli snapshot --json
```

## 6. 账号与任务命令（CLI）

```bat
:: 账号
webauto account list
webauto account login xhs-0001 --url https://www.xiaohongshu.com
webauto account sync-alias xhs-0001

:: 调度任务
webauto schedule list
webauto schedule run <taskId>
```

## 7. XHS 运行前初始化

建议先检查/准备依赖：

```bat
webauto xhs install --check --json
webauto xhs install --download-browser --json
webauto xhs install --download-geoip --json
webauto xhs install --ensure-backend --json
```

## 8. XHS 任务执行与状态

完整采集（搜索 + 评论 + 点赞）：

```bat
webauto xhs unified --profile xiaohongshu-batch-1 --keyword "deepseek" --max-notes 200 --do-comments true --persist-comments true --do-likes true --like-keywords "太强了,真不错" --match-mode any --match-min-hits 1 --max-likes 10 --env debug --tab-count 4
```

仅查状态：

```bat
webauto xhs status --json
webauto xhs status --run-id <runId> --json
```

## 9. 流控 Gate（按平台隔离）

默认会使用平台 gate 参数控制节奏（含随机区间），你可以在线修改并立即生效。

```bat
webauto xhs gate get --platform xiaohongshu --json
webauto xhs gate set --platform xiaohongshu --patch-json "{\"noteInterval\":{\"minMs\":2600,\"maxMs\":5200}}" --json
webauto xhs gate reset --platform xiaohongshu --json
```

## 10. 输出与日志

常见目录（以默认目录为例）：
- 数据根：`D:\webauto` 或 `%USERPROFILE%\.webauto`
- 采集输出：`<WEBAUTO_HOME>\download\xiaohongshu\<env>\<keyword>\`
- 运行日志：`<WEBAUTO_HOME>\logs\`

典型文件：
- `comments.jsonl`
- `like-evidence\<noteId>\summary-*.json`
- `run.log` / `run-events.jsonl`

## 11. 常见问题排查

### 11.1 UI 启动报错 `Lock file can not be created`

通常是残留进程占用：

```bat
taskkill /F /IM electron.exe /T
taskkill /F /IM node.exe /T
webauto ui console --no-daemon
```

### 11.2 `ui cli fetch failed`

先确认 UI 已启动，再查状态：

```bat
webauto ui cli start --json
webauto ui cli status --json
```

如果仍失败，前台模式查看实时日志：

```bat
webauto ui console --no-daemon
```

### 11.3 旧账号/Profile 看不到

先确认当前数据根目录是否与历史目录一致。
- 若历史数据在其它目录，可临时设置 `WEBAUTO_HOME` 指向旧目录再启动。
- 或把旧目录下的 `profiles/`、`cookies/` 等迁移到当前数据根后再启动。

## 12. 升级与版本确认

```bat
npm install -g @web-auto/webauto@latest
webauto version
webauto version --json
```

## 13. 开发者文档

如果你在仓库模式下开发，请看：
- `apps/desktop-console/README.md`
- `AGENTS.md`
