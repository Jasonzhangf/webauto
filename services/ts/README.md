# TypeScript Services (未来分层结构)

> 当前服务仍在 `services/` 根目录。本目录作为迁移门牌，不包含实际实现。

## 当前 TS 服务目录（根目录）
- `services/unified-api/`
- `services/browser-service/`
- `services/engines/`
- `services/controller/`
- `services/shared/`

## 迁移计划（不改变入口脚本）

阶段1：保留入口路径，新增 ts/ 目录作为门牌与规范
阶段2：逐步迁移实现至 `services/ts/`（保持入口脚本兼容）
阶段3：更新入口脚本指向 `services/ts/`

## 注意事项

- 运行态入口仍以根目录为准
- 迁移前请确保 `npm test` 与 `npm run build:services` 通过
