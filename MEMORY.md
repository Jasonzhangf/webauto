# WebAuto Memory - Long Term

## 2026-03-16 Tab 池管理修复

### 问题
- Tab 泄漏：预期 5 个，实际 32 个
- 评论采集停止：第 50 个帖子后无新增
- 原因：`newTab` vs `newPage` API 混用，没有 tab 关闭机制

### 修复方案
1. 统一使用 `newTab` API（在同一窗口内创建）
2. 添加 `closeExcessTabs` 函数关闭多余 tab
3. 添加 `syncTabPoolWithBrowser` 同步状态
4. Tab 布局：1 个搜索页（Tab 1）+ 4 个轮转详情页（Tab 2-5）

### 修改文件
- `modules/camo-runtime/src/autoscript/action-providers/xhs/tab-ops.mjs` - 重写
- `modules/camo-runtime/src/container/runtime-core/operations/tab-pool.mjs` - newPage → newTab

### Tab 状态机
```
Tab 1 (搜索页/主页) ← collect 遗留
Tab 2-5 (轮转详情页) ← goto 切换，间隔 2-5 秒
```

---

## 2026-03-16 UI 精简

### run-flow.mjs 精简
- 443 行 → 239 行（46% 减少）
- 移除未使用参数：orchestrateMode, accountMode, dryRun, gate, reply, ocr
- 简化 RunFlowOptions 类型：26 字段 → 16 字段

---

## 2026-03-16 锚点驱动等待重构

### 问题
- 超时判定错误：等待固定时间而非等待锚点
- 启动时错误等待 evaluate 而非检查登录锚点

### 修复
- 所有等待改为锚点驱动
- 启动成功判定：登录锚点存在即成功
- 超时 = 等待锚点的最大时间，非固定等待

---

## 2026-03-14 Collect 阶段状态机修复

### 终局条件
1. 达到目标数量
2. 连续 5 次滚动无新非重复链接
3. 连续 3 次滚动无进展
4. 遇到底部 marker

### 验证
- xsec_token 检查：所有链接必须包含 token
- 滚动检测：stuckRounds/duplicateRounds 计数器

---

## 关键架构决策

### 三层架构
- Block 层：原子能力
- App/Orchestrator 层：流程编排
- UI 层：展示与交互

### 全局唯一真源
- 产生输出时：确保是全局唯一真源
- 消费数据时：确保来自全局真源

### Tab 管理原则
- 只用 `newTab`，不用 `newPage`
- 固定 5 个 tab：1 搜索 + 4 详情
- 初始化时清理多余 tab
- 每次操作前同步实际浏览器状态
