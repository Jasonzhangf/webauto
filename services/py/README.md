# Python Services (未来分层结构)

> 当前 Python 服务已迁移至 `services/legacy/python/`，仅保留 Camoufox 启动器在根目录。

## 当前 Python 服务
- `services/browser_launcher.py` （Camoufox 专用，仍在使用）
- `services/legacy/python/`（已废弃的 Python 服务）

## 迁移计划

阶段1：保留 `services/browser_launcher.py`，新增 py/ 目录作为门牌
阶段2：如需保留 Python 服务，迁移到 `services/py/` 并更新引用
阶段3：移除 legacy python

## 注意事项

- `runtime/browser/scripts/one-click-camoufox.mjs` 仍直接引用 `services/browser_launcher.py`
- 修改路径需同步更新上述脚本
