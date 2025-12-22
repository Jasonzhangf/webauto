# Browser 模块

提供浏览器会话管理、Cookie 注入与容器匹配的独立 CLI。

## 使用

```bash
# 启动
node modules/browser/cli.mjs start --profile weibo_fresh --headless

# 停止
node modules/browser/cli.mjs stop --profile weibo_fresh

# 查看状态
node modules/browser/cli.mjs status

# 健康检查
node modules/browser/cli.mjs health
```
