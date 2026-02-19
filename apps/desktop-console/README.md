# WebAuto Desktop Console & UI Automation

目标：提供一个 Electron（跨平台）多 Tab 管理台，用于管理 profile 登录池、流程调用与结果浏览。UI 仅负责参数/交互，实际业务执行仍走现有 `scripts/` 与 `dist/`。

## 开发

```bash
# 从仓库根目录（推荐：通过 webauto CLI）
npm link
npm --prefix apps/desktop-console install
npm --prefix apps/desktop-console run build
npm run build:services
webauto ui console

# 或者直接进入目录
cd apps/desktop-console
npm install
npm run build
npm start
```

## UI 自动化 CLI

`webauto ui cli` 用于真实驱动 Desktop UI（不是 mock，不是静态断言）。

```bash
# 查看命令
webauto ui cli --help

# 自动构建并启动控制台（若未启动）
webauto ui cli start --build

# 当前状态/快照
webauto ui cli status --json
webauto ui cli snapshot --json
```

### 常用动作

```bash
webauto ui cli tab --tab 配置
webauto ui cli input --selector "#keyword-input" --value "春晚"
webauto ui cli input --selector "#target-input" --value "100"
webauto ui cli click --selector "#start-btn"

# 探测与等待
webauto ui cli probe --selector "#run-id-text" --json
webauto ui cli wait --selector "#run-id-text" --state exists --timeout 20000

# 按文本点击（避免 brittle selector）
webauto ui cli click-text --text "保存"

# 结束后关闭窗口
webauto ui cli stop
```

### 一键真实覆盖（推荐）

```bash
webauto ui cli full-cover --json
```

默认输出报告：
- `.tmp/ui-cli-full-cover-<timestamp>.json`
- 报告包含：`steps`、`controls`、`coverage`（总数/通过/失败 + 分页签统计）

### 测试与门禁（本地/CI 一致）

```bash
# 渲染层回归
npm --prefix apps/desktop-console run test:renderer

# 覆盖门禁（当前阈值：line/statements >=90, functions >=85, branches >=55）
npm --prefix apps/desktop-console run test:renderer:coverage

# Desktop 构建
npm --prefix apps/desktop-console run build
```

### 常见调试流程

```bash
# 1) 前台启动 UI（便于看日志）
webauto ui console --no-daemon

# 2) 用 UI CLI 驱动并观察状态回流
webauto ui cli start
webauto ui cli tab --tab 看板
webauto ui cli probe --selector "#error-count-text" --json
webauto ui cli snapshot --json
```

## UI Tabs

- **初始化**：环境检查 + 账户设置（首次启动向导）
- **配置**：爬取目标设定、选项配置、配置导入/导出
- **看板**：实时进度监控、统计、日志
- **账户管理**：账户列表、状态检查、重新登录
- 预处理：ProfilePool 管理 + 批量登录/补登录
- 调用：按模板拼装 CLI 参数并运行脚本（支持 `--dry-run`）
- 结果：浏览 `~/.webauto/download` 并预览截图
- 设置：优先保存到 `~/.webauto/config.json` 的 `desktopConsole` 配置块（如 `dist/modules/config` 不存在则 fallback 到 legacy settings 文件）

## 架构

```
apps/desktop-console/
├── entry/
│   ├── ui-console.mjs      # 启动 Electron 控制台
│   └── ui-cli.mjs          # UI 自动化 CLI（真实驱动）
├── src/
│   ├── main/
│   │   ├── index.mts       # Electron 主进程
│   │   ├── preload.mjs     # Preload 脚本（暴露 API）
│   │   ├── env-check.mts   # 环境检查模块
│   │   ├── ui-cli-bridge.mts # UI CLI HTTP bridge
│   │   └── desktop-settings.mts  # 配置管理
│   └── renderer/
│       ├── index.mts       # 渲染进程入口
│       ├── index.html      # HTML 模板
│       └── tabs-new/       # 新 UI 组件
│           ├── setup-wizard.mts    # 初始化向导
│           ├── config-panel.mts    # 配置面板
│           ├── dashboard.mts       # 执行看板
│           ├── scheduler.mts       # 定时任务
│           └── account-manager.mts # 账户管理
└── dist/                   # 构建产物
```

## API 接口

### 环境检查 API
- `envCheckCamo()` - 检查 Camoufox CLI
- `envCheckServices()` - 检查服务状态 (7701，7704 为可选)
- `envCheckFirefox()` - 检查 Firefox 浏览器
- `envCheckAll()` - 完整环境检查

### 配置管理 API
- `configSaveLast(config)` - 保存上次配置
- `configLoadLast()` - 加载上次配置
- `configExport({filePath, config})` - 导出配置
- `configImport({filePath})` - 导入配置

### 状态订阅 API
- `onStateUpdate(callback)` - 订阅任务状态更新

## CLI 状态查询

```bash
webauto xhs status
webauto xhs status --run-id <runId> --json
```

### 跨平台支持

| 平台 | camo CLI | Electron | 路径处理 | 编码 |
|------|----------|----------|---------|------|
| Windows | `where camo` | ✅ | `path.join` | UTF-8 BOM |
| macOS | `which camo` | ✅ | `path.join` | UTF-8 |
| Linux | `which camo` | ✅ | `path.join` | UTF-8 |

**注意事项**:
- Windows 需要手动安装 `@web-auto/camo`：`npm install -g @web-auto/camo`
- Windows 配置文件导出使用 UTF-8 BOM 编码（兼容记事本）
- 所有路径使用 `path.join` 自动适配 `/` 和 `\`
