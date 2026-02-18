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

### 启动控制台

```bash
# 检查构建状态
webauto ui console --check

# 自动构建并启动
webauto ui console --build

# 前台模式运行
webauto ui console --no-daemon
```

### 自动化测试

```bash
# 环境检查测试
webauto ui test env-check

# 账户流程测试
webauto ui test account-flow --profile test-001

# 配置保存测试
webauto ui test config-save --output ./report.json

# 爬取流程测试 (dry-run)
webauto ui test crawl-run --keyword "测试" --target 10 --headless
```

### 测试场景

| 场景 | 说明 |
|------|------|
| `env-check` | 检查 camo CLI、Unified API (7701)、Browser Service (7704) |
| `account-flow` | 测试 profile 创建流程 |
| `config-save` | 测试配置导入/导出功能 |
| `crawl-run` | 测试完整爬取流程 (dry-run 模式) |

### 测试选项

- `--profile <id>` - 指定测试用 profile ID
- `--keyword <kw>` - 测试关键词
- `--target <n>` - 目标数量
- `--headless` - 无头模式运行
- `--output <path>` - 输出 JSON 测试报告

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
│   └── ui-console.mjs      # CLI 入口（启动 + 自动化测试）
├── src/
│   ├── main/
│   │   ├── index.mts       # Electron 主进程
│   │   ├── preload.mjs     # Preload 脚本（暴露 API）
│   │   ├── env-check.mts   # 环境检查模块
│   │   └── desktop-settings.mts  # 配置管理
│   └── renderer/
│       ├── index.mts       # 渲染进程入口
│       ├── index.html      # HTML 模板
│       └── tabs-new/       # 新 UI 组件
│           ├── setup-wizard.mts    # 初始化向导
│           ├── config-panel.mts    # 配置面板
│           ├── dashboard.mts       # 执行看板
│           └── account-manager.mts # 账户管理
└── dist/                   # 构建产物
```

## API 接口

### 环境检查 API
- `envCheckCamo()` - 检查 Camoufox CLI
- `envCheckServices()` - 检查服务状态 (7701/7704)
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
