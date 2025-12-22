# Scripts 目录

## 唯一入口脚本

### start-headful.mjs
启动 WebAuto 的唯一入口脚本。内部调用 launcher/headful-launcher.mjs。

```bash
# 标准启动（有头浏览器 + 浮窗）
node scripts/start-headful.mjs --profile weibo_fresh --url https://weibo.com

# 调试模式（无头）
node scripts/start-headful.mjs --profile weibo_fresh --url https://weibo.com --headless
```

## Shell 兼容

### start_browser.sh
Shell 包装脚本，保持向后兼容。

```bash
./start_browser.sh --profile weibo_fresh --url https://weibo.com
```

## 架构说明

- 脚本只负责 CLI 参数解析
- 所有业务逻辑在 launcher/headful-launcher.mjs
- 端口统一：7701（Unified API）、7704（Browser Service）
- 详细文档请参考 docs/arch/ 目录
