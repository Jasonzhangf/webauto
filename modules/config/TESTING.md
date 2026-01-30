# 配置模块测试指南

本模块测试使用 `node:test` + `node:assert/strict`，通过仓库根目录的 `tsx` 运行（项目统一 ESM）。

## 运行测试（推荐）

在仓库根目录执行全部模块单测：

```bash
npm run test:modules:unit
```

仅运行 config 模块测试：

```bash
npx tsx --test modules/config/src/*.test.ts
```

## 覆盖率（建议用于回归门槛）

生成覆盖率报告（仓库根目录）：

```bash
npx c8 --reporter=text --reporter=lcov tsx --test modules/config/src/*.test.ts
```

说明：
- 覆盖率产物默认输出到 `coverage/`（已在根 `.gitignore` 中忽略）。
- 集成测试使用 `os.tmpdir()` 临时目录 + `WEBAUTO_CONFIG_PATH`，避免读写用户真实 `~/.webauto/config.json`。

## 测试文件

- `modules/config/src/ConfigLoader.test.ts`
- `modules/config/src/ConfigValidator.test.ts`
- `modules/config/src/integration.test.ts`
