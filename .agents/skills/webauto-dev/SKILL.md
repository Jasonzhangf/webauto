# WebAuto Dev Skill

## 触发条件
当任务涉及 webauto 项目的代码开发、重构、新功能、bug 修复时使用此 skill。

---

## 一、架构原则（硬约束，最高优先级）

### 1.1 功能分层定义
```
L0 shared/           — 零业务依赖，纯工具函数（sleep、clickPoint、callAPI、persistence）
L1 action-providers/ — 平台业务逻辑（DOM 选择器、内容提取脚本、风控检测）
L2 runners/          — 编排逻辑（apps/webauto/entry/），流程控制、状态管理、任务调度
L3 CLI/API           — 入口（bin/webauto.mjs, services/），参数解析、路由分发
```

### 1.2 编排独立原则（强制）
**编排逻辑（Orchestration）严禁混入底层（L0/L1）。具体规则：**

- L0（shared/）**禁止**包含任何编排逻辑：不能有任务调度、状态流转、重试策略、条件分支编排
- L1（action-providers/）**禁止**包含编排逻辑：不能有"先做 A 再做 B"的流程控制，只能做单步 DOM 操作和数据提取
- L2（runners/）是**唯一允许编排的地方**：任务拆分、重试策略、断点续传、多步骤流程控制
- L1 调用 L0 ✅，L2 调用 L1 ✅，L1 调用 L2 ❌，L0 调用 L1 ❌

### 1.3 代码共享原则
- 跨平台复用的能力**必须**放入 `shared/`（L0），不要在 xhs/ 和 weibo/ 中各自实现
- 平台特有能力保留在各平台 `action-providers/`（L1）
- 每个共享模块**单一职责**，文件 < 300 行
- 新增函数前先检查 `shared/` 是否已有等价实现

### 1.4 仓库边界
- **camo**（@web-auto/camo）= 通用框架，**禁止**包含任何业务文件（xhs-*.mjs、weibo-*.mjs）
- **webauto** = 业务项目，所有业务逻辑在此
- `modules/camo-runtime/` = vendor 副本，可包含业务代码
- 发现业务逻辑进入 camo → 必须回迁到 webauto

### 1.5 导入规则
- camo-runtime（L0/L1）不能 import webauto 应用层（L2/L3）
- 平台 A 的 action-provider 不能 import 平台 B 的文件
- 共享能力放 `shared/`，不要跨平台复制

### 1.6 编码规范
- 文本输入用 `fillInputValue`（不用 `keyboard:type`，IME 不兼容）
- 快捷键用 `pressKey`（`Meta+A`、`Enter`、`Backspace`）
- **等待必须锚点驱动**（`waitForAnchor`），**禁止无锚点 `sleep`**
  - 超时 = 最长等待时间，不是固定等待时间
  - 锚点出现立即返回，不等超时到期
  - 如果无法定义锚点，说明操作设计有问题
- 操作级超时 15s，熔断器保护队列
- 所有搜索走页面内输入 + 回车（禁止构造搜索 URL）
- 不创建巨型文件（单文件 < 500 行为目标）

---

## 二、开发流程（WebAuto Dev Flow）

### Step 0: 前置检查（每次开始前必做）
1. `git pull` 拉取最新代码
2. 检查 `CACHE.md` 和 `MEMORY.md` 获取最近上下文
3. 确认当前分支是 `main`（开发在 main 上直接进行，不用 feature branch）

### Step 1: 理解需求
- 明确用户要做什么
- 如果需求模糊，先确认再动手（但不要问太多，优先合理假设执行）

### Step 2: 代码审查（Review First）
- **任何改动前先读相关代码**，不要盲改
- 理解现有架构和分层（见上方架构原则）
- 检查是否有共享模块可复用（`shared/` 层）
- 识别改动影响范围，评估是否会误伤其他平台
- 输出审查结论：需要改哪些文件、改什么、影响范围

### Step 3: 设计文档（Design Doc First）
- **中等以上改动必须先写设计文档**
- 文档落盘路径：`docs/arch/<feature-name>-design.md`
- 文档包含：
  - 目标与背景
  - 现状分析（引用实际代码行号和文件）
  - 方案设计（分层、模块、接口、依赖关系）
  - 影响范围评估
  - 验证计划
- 小改动（单文件 < 50 行变更）可跳过设计文档

### Step 4: 编写代码
- 严格遵循分层：L0 shared → L1 action-providers → L2 runners
- 检查每个新增函数是否放对了层级
- 编排逻辑只在 L2（runners/），不在 L0/L1
- 复用 shared/ 模块，不重复实现
- 每个 commit 做一件事，commit message 清晰

### Step 5: 本地验证（Pre-push Check）
- 新模块：`node -e "import('./path/to/module.mjs')"` 验证 import
- 改动模块：确认没有语法错误
- 确认 git status 干净（无意外修改）

### Step 6: 提交推送
```bash
git add <files>
git commit -m "<type>: <summary>"
git push
```
Commit type: `feat`, `fix`, `refactor`, `docs`, `chore`

### Step 7: 手动 Camo 真机验证（Manual Test）
**任何涉及浏览器操作的改动，必须先用 camo 手动走一遍完整操作流程。**

验证步骤：
1. `camo start <profile> --url <target-url>` 启动浏览器
2. **手动走一遍完整操作流程**（导航 → 输入 → 等待 → 提取 → 验证结果）
3. 确认每个步骤都有锚点检测（不是盲等）
4. 确认提取数据完整、格式正确
5. 确认异常情况处理正常（元素不存在、超时、风控）

**手动验证通过 → 才能进入 Step 8 自动编排测试**
**手动验证失败 → 回到 Step 4 修复代码，不能进入 Step 8**

### Step 8: 自动编排测试（E2E Test）
**手动验证通过后，通过 daemon 提交任务进行端到端验证。**

```bash
webauto daemon task submit --detach -- <command> <args>
```

监控任务执行：
- `webauto daemon status --json` 查看任务状态
- 检查输出文件：`~/.webauto/download/<platform>/<env>/`
- 检查日志：`~/.webauto/logs/` 和 run.log
- 确认去重/合并逻辑正确

**E2E 测试通过 = 交付完成**
**E2E 测试失败 → 分析日志定位根因 → 回到 Step 4 修复**

### Step 9: 记录与清理
- 重要决策写入 `MEMORY.md`
- 本次会话进度写入 `CACHE.md`
- 关闭不再需要的 clock 定时任务
- 清理临时文件和调试输出

---

## 三、验证清单

### 代码变更后
- [ ] import 验证通过（`node -e "import(...)"` 无报错）
- [ ] 无跨层导入（L0/L1 不依赖 L2/L3）
- [ ] 无编排逻辑混入底层（L0/L1 无流程控制代码）
- [ ] 无重复代码（已复用 shared/）
- [ ] 每个 `sleep` 都有锚点保护（无盲等待）
- [ ] commit message 清晰（type: summary）

### 手动 Camo 验证后
- [ ] 完整操作流程手动走通
- [ ] 每个等待步骤有锚点检测
- [ ] 输入用 fillInputValue（无 keyboard:type 输入文本）
- [ ] 快捷键用 pressKey
- [ ] 提取数据完整、格式正确
- [ ] 异常情况处理正常

### E2E 验证后
- [ ] daemon task 完整执行（exit code 0）
- [ ] 输出文件正确生成（posts.jsonl / collection-meta.json）
- [ ] 无异常日志（检查 run.log 和 daemon events）
- [ ] 去重/合并逻辑正确（无重复数据）
- [ ] 提供完整证据链（命令 + 输出 + 日志路径）

---

## 四、常用命令速查

### 基础操作
```bash
git pull && git push
webauto daemon status --json
webauto daemon task submit --detach -- <command>
```

### 浏览器操作
```bash
camo start <profile> --url <url>
camo status <profile>
camo stop all
```

### 服务检查
```bash
curl http://127.0.0.1:7701/health
curl http://127.0.0.1:7704/health
```

### 代码审查命令
```bash
rg "sleep\(" <path> --type js              # 检查是否有盲 sleep
rg "keyboard:type" <path> --type js        # 检查 IME 风险输入
rg "from '\.\./\.\." <path> --type js      # 检查跨层导入
rg "runCamo|execSync" <path> --type js     # 检查阻塞调用
rg "goto.*search|search_result" <path>     # 检查是��构造搜索 URL
```

### 日志检查
```bash
tail -200 ~/.webauto/state/<runId>.events.jsonl  # 任务事件日志
tail -200 ~/.webauto/logs/desktop-lifecycle.jsonl # 桌面日志
cat ~/.webauto/download/<platform>/<env>/<keyword>/run.log  # 运行日志
```

---

## 五、注意事项
1. **先验证后结论**：没有证据不宣称完成
2. **禁止静默失败**：不做无条件 fallback，不吞异常
3. **检查工具输出**：每个命令执行后必须检查输出，不要假设成功
4. **手动 → 自动 两级验证**：手动 camo 走通才能进自动 E2E，不可跳过
5. **锚点驱动等待**：所有等待必须有锚点，超时是最长等待不是固定等待
6. **编排逻辑只在 L2**：L0/L1 只做单步操作，不做流程控制
7. **Windows 兼容**：注意终端编码（UTF-8），避免中文乱码
8. **NPM 发布**：camo 包更新后需 `npm publish`，webauto 通过 `npm install @web-auto/camo@latest` 同步
9. **每次改动前先评估影响范围**：避免误伤其他平台、其他功能
