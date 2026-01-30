# WebAuto Desktop Console

目标：提供一个 Electron（跨平台）多 Tab 管理台，用于管理 profile 登录池、流程调用与结果浏览。UI 仅负责参数/交互，实际业务执行仍走现有 `scripts/` 与 `dist/`。

## 开发

```bash
cd apps/desktop-console
npm install
npm run build
npm start
```

## Tabs

- 预处理：ProfilePool 管理 + 批量登录/补登录
- 调用：按模板拼装 CLI 参数并运行脚本（支持 `--dry-run`）
- 结果：浏览 `~/.webauto/download` 并预览截图
- 设置：优先保存到 `~/.webauto/config.json` 的 `desktopConsole` 配置块（如 `dist/modules/config` 不存在则 fallback 到 legacy settings 文件）
