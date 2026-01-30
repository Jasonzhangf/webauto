# 配置模块覆盖率

此文件不再保存“人工估算覆盖率”，避免与实际结果不一致。

请以 `c8` 的真实输出为准（仓库根目录）：

```bash
npx c8 --reporter=text --reporter=lcov tsx --test modules/config/src/*.test.ts
```
