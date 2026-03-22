# WebAuto CLI 重构设计

## 目标

1. **UI/应用去耦合**：CLI 完全独立于 desktop-console/electron
2. **纯 CLI 版本**：支持一键命令执行自动化任务
3. **跨平台**：Windows/macOS/Linux 统一体验

## 当前问题

- `bin/webauto.mjs` UI 代码已清理（~980行），原~1300行
- daemon 模式和直接模式混合
- daemon relay 已移除，CLI 直连 runUnified
- 初始化流程已简化，不依赖 UI 构建

## 新架构

### 目录结构

```
bin/
  webauto.mjs          # 现有入口（保留向后兼容）
  wa.mjs               # 新的精简 CLI 入口（软链接到 cli/index.mjs）

cli/                   # 新增：纯 CLI 模块
  index.mjs            # CLI 主入口、命令路由
  commands/
    init.mjs           # wa init - 环境初始化
    run.mjs            # wa run - 一键执行
    status.mjs         # wa status - 任务状态
    login.mjs          # wa login - 登录管理
    stop.mjs           # wa stop - 停止任务
  lib/
    env-check.mjs      # 环境检查（Node版本、系统依赖）
    dependency.mjs     # 依赖安装（camo、camoufox、geoip）
    config.mjs         # 配置管理（~/.webauto/config.json）
    profile.mjs        # Profile 管理
    output.mjs         # 输出格式化（JSON/表格/静默）
    cross-platform.mjs # 跨平台适配

apps/webauto/entry/    # 业务逻辑层（保持不变）
  lib/                 # 核心 runner 和 blocks
  *.mjs               # 各入口脚本

services/              # HTTP 服务（可选启动）
  unified-api/        # 统一 API 服务

apps/desktop-console/  # UI 层（独立，CLI 不依赖）
```

### 命令设计

#### wa init

检查并初始化运行环境。

```
wa init [options]

Options:
  --check              仅检查，不安装
  --install-camo       安装 camo CLI
  --install-browser    安装 camoufox 浏览器
  --install-geoip      安装 GeoIP 数据库
  --profile <id>       创建/配置账户 profile
  --login              启动登录流程

检查项:
  1. Node.js 版本 >= 18
  2. camo CLI 已安装
  3. camoufox 浏览器已安装
  4. GeoIP 数据库已下载
  5. Profile 配置存在
  6. 登录状态有效
```

#### wa run

一键执行自动化任务。

```
wa run [options]

Options:
  -k, --keyword <kw>      搜索关键字（必需）
  -l, --like <keywords>   点赞关键字（逗号分隔）
  -n, --count <n>         目标帖子数（默认 30）
  -p, --profile <id>      Profile ID（默认 default）
  --max-likes <n>         每帖最大点赞数（默认 5）
  --no-comments           不采集评论
  --no-likes              不点赞
  --headless              无头模式
  --env <name>            输出环境（默认 debug）
  --json                  JSON 输出
  --detach                后台运行

示例:
  wa run -k "梅姨" -l "吓死了" -n 50
  wa run -k "春分养生" -n 10 --headless --json
  wa run -k "美食" -l "好吃,推荐" -n 100 --detach
```

#### wa status

查看任务状态。

```
wa status [options]

Options:
  --run-id <id>      指定任务 ID
  --json             JSON 输出
  --watch            持续监控

输出:
  - 当前运行任务
  - 已完成/失败统计
  - 评论采集进度
  - 点赞命中数
```

#### wa login

登录管理。

```
wa login [options]

Options:
  --profile <id>     指定 profile
  --status           检查登录状态
  --logout           登出

流程:
  1. 打开浏览器到登录页
  2. 等待用户手动登录
  3. 保存登录状态到 profile
```

#### wa stop

停止任务。

```
wa stop [options]

Options:
  --run-id <id>      指定任务 ID
  --all              停止所有任务
```

### 配置文件

`~/.webauto/config.json`

```json
{
  "version": "1.0.0",
  "profiles": {
    "default": {
      "platform": "xiaohongshu",
      "loginUrl": "https://www.xiaohongshu.com",
      "lastLoginCheck": "2026-03-21T15:00:00Z",
      "loginValid": true
    }
  },
  "defaults": {
    "maxNotes": 30,
    "maxLikes": 5,
    "env": "debug",
    "headless": false
  }
}
```

### 跨平台适配

| 平台 | 适配项 |
|------|--------|
| macOS | Homebrew 路径、.appbundle |
| Windows | PowerShell、注册表路径、.exe |
| Linux | /usr/local、snap/apt |

### 依赖关系

```
wa (CLI) 
  ├── cli/lib/* (工具函数)
  ├── apps/webauto/entry/lib/* (业务逻辑)
  ├── services/unified-api (可选 HTTP 服务)
  └── @web-auto/camo (浏览器控制)
```

**不依赖**：
- apps/desktop-console
- electron
- 任何 UI 框架

## 实施阶段

### Phase 1: 骨架（1天）
- [ ] 创建 cli/ 目录结构
- [ ] 实现 cli/index.mjs 命令路由
- [ ] 创建 bin/wa.mjs 入口

### Phase 2: init 命令（1天）
- [ ] 实现 env-check.mjs
- [ ] 实现 dependency.mjs
- [ ] 实现 config.mjs
- [ ] 实现 init.mjs 命令

### Phase 3: run 命令（2天）
- [ ] 实现 run.mjs 命令
- [ ] 调用现有 entry/lib/* 业务逻辑
- [ ] 输出格式化

### Phase 4: 其他命令（1天）
- [ ] 实现 status.mjs
- [ ] 实现 login.mjs
- [ ] 实现 stop.mjs

### Phase 5: 跨平台测试（1天）
- [ ] macOS 测试
- [ ] Windows 测试
- [ ] Linux 测试

## Phase1 Review Evidence Matrix

| 命令/模块 | 对应源文件 | 调用的 entry/lib 入口 | 错误处理策略 | 跨平台处理点 | ESM 导入 | 潜在注入点 |
|---|---|---|---|---|---|---|
| CLI 入口 | `bin/wa.mjs` | 无（仅加载 CLI） | 由 CLI 捕获错误 | 仅路径拼接 | `import` ESM | 无 |
| 命令路由 | `cli/index.mjs` | 无 | try/catch + exit(1) | 无 | `import` 动态 | 无 |
| 执行器 | `cli/lib/executor.mjs` | `apps/webauto/entry/lib/xhs-unified-runner.mjs` (`runUnified`) | Promise 捕获 + exit code | `spawn` shell:false | `import` ESM | 参数注入 → 数组 + 校验 |
| 跨平台工具 | `cli/lib/cross-platform.mjs` | 无 | execSync try/catch | npm/npx/python 命令选择 | `import` ESM | runCmd 使用字符串命令（限制在 init/status） |
| init 命令 | `cli/commands/init.mjs` | `cli/lib/env-check.mjs` | 失败提示 + 返回 | 无 | `import` ESM | 仅文件路径/配置写入 |
| run 命令 | `cli/commands/run.mjs` | `cli/lib/executor.mjs` | 参数校验 + fail | 无 | `import` ESM | 无（executor 已校验） |

### Evidence Notes
- **ESM**：所有 CLI 文件使用 `.mjs` 扩展并以 `import` 引用
- **单一真源**：CLI 直接调用 `runUnified`，不再经过 daemon relay
- **安全**：executor 中所有外部执行统一为 `spawn([...])` + `shell:false` + 参数校验
- **跨平台**：通过 `cross-platform.mjs` 提供 npm/npx/python 命令选择

## 使用示例

### 首次使用

```bash
# 初始化环境
wa init

# 安装依赖
wa init --install-camo --install-browser --install-geoip

# 创建账户并登录
wa login --profile xhs-qa-1
```

### 日常使用

```bash
# 一键执行
wa run -k "梅姨" -l "吓死了" -n 50

# 查看状态
wa status

# 后台运行
wa run -k "美食" -n 100 --detach

# 停止任务
wa stop --all
```

## 向后兼容

- `bin/webauto.mjs` 保持不变，现有流程继续工作
- 新用户推荐使用 `wa` 命令
- 两种方式共享相同的业务逻辑层
