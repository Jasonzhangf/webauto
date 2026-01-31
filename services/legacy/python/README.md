# ⚠️ LEGACY - Python Services

**此目录包含已废弃的 Python 服务实现。**

## 迁移说明

- **废弃时间**: 2026-01-31
- **原因**: 已被 TypeScript 服务替代（`services/browser-service/`、`services/unified-api/`）
- **唯一真源**: `services/browser-service/`（TypeScript）

## 文件说明

| 文件 | 用途 | 替代方案 |
|------|------|----------|
| `browser_service.py` | 浏览器服务 | `services/browser-service/index.ts` |
| `browser_service_interface.py` | 浏览器服务接口 | `services/browser-service/types/` |
| `container_registry.py` | 容器注册表 | `services/browser-service/ContainerRegistry.ts` |
| `demo_browser_service.py` | 演示服务 | `services/browser-service/` |
| `fingerprint_manager.py` | 指纹管理 | `libs/browser/fingerprint-manager.js` |
| `test_browser_service_concept.py` | 测试脚本 | `tests/integration/` |

## 保留的 Python 服务

**`services/browser_launcher.py`** - Camoufox 专用启动器（仍在使用）

此文件未被移至此目录，因为它被 `runtime/browser/scripts/one-click-camoufox.mjs` 引用。

## 如果你看到此目录的引用

1. **检查是否为历史代码引用**
   - 若是，更新为 TypeScript 服务引用
   - 运行 `npm test` 验证修改

2. **检查是否为测试/演示代码**
   - 若是，考虑删除或迁移到 TypeScript 测试

## 计划删除时间

- 预计在所有引用迁移完成后（2026-03-15）删除此目录

---

**禁止新增任何对此目录的引用！**
