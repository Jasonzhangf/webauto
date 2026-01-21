# macOS OCR 插件（Vision）

## 目的

在开发/守护进程（daemon）模式下，将 OCR 作为 **独立的 macOS 插件二进制** 执行，避免把 OCR 逻辑耦合在 Node 依赖或第三方 OCR 运行时里。

## 构建与安装

构建（产物写入仓库 `dist/`）：

```bash
npm run build:ocr:macos
```

安装到用户目录（推荐，运行时默认会优先从这里查找）：

```bash
node scripts/build/build-ocr-macos.mjs --install
```

安装后位置：

- `~/.webauto/bin/webauto-ocr-macos`

也可以通过环境变量指定路径：

- `WEBAUTO_OCR_BIN=/absolute/path/to/webauto-ocr-macos`

## 运行示例

```bash
./dist/plugins/ocr-macos/webauto-ocr-macos --json --langs "chi_sim+eng" /path/to/image.jpg
```

说明：

- `--langs` 支持 `chi_sim+eng`（会映射为 Vision 的 `zh-Hans,en-US`）
- 输出为 JSON 数组：`[{ image, text?, error? }]`

