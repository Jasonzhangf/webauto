# WebAuto 基础功能 Block 测试清单

用于跨平台移植前/后快速验收“基础能力是否可用”。

## 一键命令

```bash
node scripts/test/webauto-smoke.mjs
```

按 block 运行：

```bash
node scripts/test/webauto-smoke.mjs --block env
node scripts/test/webauto-smoke.mjs --block camo
node scripts/test/webauto-smoke.mjs --block daemon
node scripts/test/webauto-smoke.mjs --block browser
node scripts/test/webauto-smoke.mjs --block xhs
```

## Block 列表

### 1) env（运行环境）
- Node/OS/ARCH
- `~/.webauto` 路径
- `bin/webauto.mjs` 存在
- 关键模块可加载（dom-ops / harvest-ops / comments-ops / persistence / diagnostic-utils / xhs-unified-options / js-policy）

### 2) camo（浏览器运行时）
- `:7704/health`
- `evaluate` 可执行
- `screenshot` 可获取 base64
- `mouse:click` / `keyboard:press` API 可调用
- `:7701` 不通时记为 **SKIP（可选）**

### 3) daemon（任务调度）
- `:7701/health`
- `/api/v1/jobs`
- daemon 未启动时记为 **SKIP（可选）**

### 4) browser（基础交互）
- 读取 `location`
- DOM 结构可读
- viewport 可读

### 5) xhs（业务基础能力）
- `resolveXhsOutputContext` 逻辑
- `normalizeInlineText` 逻辑
- js-policy 拦截规则
- 当前页面是否在 xiaohongshu 域
- like-target 选择器链是否可定位（`.like-wrapper > .like-lottie`）

## 结果判定

- **PASS**：能力可用
- **SKIP**：当前环境未启用该能力（例如 daemon 未启动）
- **FAIL**：能力异常，需先修复再继续业务测试

建议标准：
- 迁移验收：`FAIL=0`
- 若 `SKIP>0`，需要确认是否是预期（如未启动 daemon）

