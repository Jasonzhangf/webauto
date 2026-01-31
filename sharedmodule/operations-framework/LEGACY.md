# ⚠️ LEGACY - 请勿使用

**此目录已废弃，请使用 `libs/operations-framework` 作为唯一真源。**

## 迁移说明

- **唯一真源**: `libs/operations-framework/`
- **废弃时间**: 2026-01-30
- **原因**: 与 `libs/operations-framework` 内容重复，且无实际代码引用

## 如果你看到此目录的引用

1. 检查是否为文档引用（如 README/设计文档）
   - 若是，更新文档指向 `libs/operations-framework`
2. 检查是否为代码引用
   - **立即修改**：将 `sharedmodule/operations-framework` 替换为 `libs/operations-framework`
   - 运行 `npm test` 验证修改

## 计划删除时间

- 预计在所有文档引用更新完成后（2026-02-15）删除此目录

---

**禁止新增任何对此目录的引用！**
