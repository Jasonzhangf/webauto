# ⚠️ LEGACY - 请勿使用

**此目录已废弃，请使用 `libs/browser` 作为唯一真源。**

## 迁移说明

- **唯一真源**: `libs/browser/`
- **废弃时间**: 2026-01-31
- **原因**: 职责与 `libs/browser` 重复，且几乎无实际引用

## 职责对比

### modules/browser（已废弃）
- 提供命令行接口（start/stop/status/health）
- 调用 browser-service HTTP 接口
- **问题**: services/browser-service 已提供相同功能，无需独立 CLI

### libs/browser（唯一真源）
- 统一浏览器操作接口（browser.js 唯一入口）
- 抽象层（AbstractBrowser）+ 具体实现（PlaywrightBrowser）
- Cookie/Fingerprint 管理
- 远程服务

## 如果你看到此目录的引用

1. **检查是否为 CLI 调用**
   - 若是，改为直接调用 `services/browser-service` HTTP 接口
   - 或使用 `node modules/browser/cli.mjs` 的兼容层（临时）

2. **检查是否为浏览器抽象层引用**
   - **立即修改**：将 `modules/browser` 替换为 `libs/browser`
   - 运行 `npm test` 验证修改

## 业务逻辑迁移路径

- `src/health/` → 迁移到 `services/browser-service/health/`
- `src/controller/` → 合并到 `modules/controller/`
- `src/container/` → 合并到 `modules/container-matcher/`

## 计划删除时间

- 预计在所有引用迁移完成后（2026-03-01）删除此目录

---

**禁止新增任何对此目录的引用！**
