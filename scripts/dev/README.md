# scripts/dev

开发者工具脚本（一次性）。

## 全局安装（开发态）

```bash
node scripts/dev/build-install-global.mjs
```

可选参数：

- `--link`：使用 `npm link`（避免 `npm install -g` 的权限问题）
- `--full`：在 `npm test` 之后再跑 `node tests/runner/TestRunner.mjs --all`

