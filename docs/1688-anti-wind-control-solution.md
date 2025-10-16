# 1688 反风控解决方案

## 概述

本方案通过使用Camoufox浏览器和完整的Cookie集合，成功绕过1688的风控检测，实现自动化访问。

## 核心技术栈

### 1. Camoufox浏览器
- **版本**: 最新版本 (0.4.11+)
- **特点**: C++级别的浏览器指纹伪装
- **路径**: `/Users/fanzhang/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox`

### 2. 完整Cookie集合
- **数量**: 174个有效cookies (最终)
- **关键域名**:
  - `.1688.com` - 30个
  - `.taobao.com` - 37个
  - `.tmall.com` - 30个
  - `.tmall.hk` - 23个
  - `.fliggy.com` - 23个
  - `.mmstat.com` - 7个
  - 其他域名 - 24个

### 3. 关键认证标识
```json
{
  "__cn_logon__": "true",
  "__cn_logon_id__": "viridite",
  "__last_loginid__": "b2b-28217351",
  "__last_memberid__": "b2b-28217351",
  "cookie2": "14d065b6dd80471f4e498cf097832881",
  "_tb_token_": "57a3d64e3bbee"
}
```

## 实施流程

### 第一步：获取完整Cookie集合

使用手动登录脚本 `proper-1688-login.cjs`:

```javascript
// 关键特性
1. 恢复备份Cookie
2. 使用Camoufox浏览器
3. 直接访问1688主页
4. 自动检测登录成功 (__cn_logon__: true)
5. 保存完整Cookie集合 (无过滤)
6. 自动备份机制
```

**执行命令**:
```bash
node scripts/proper-1688-login.cjs
```

### 第二步：预登录流程配置

使用预登录流程 `1688-login-preflow.json`:

```json
{
  "engine": "camoufox",
  "headless": false,
  "strictAutomationMitigation": true,
  "extraHeaders": true,
  "cookiePath": "~/.webauto/cookies/1688-domestic.json"
}
```

**关键配置**:
- Camoufox引擎
- 完整反检测启动参数
- 174个Cookie自动加载
- 会话预热机制

### 第三步：主流程执行

**执行命令**:
```bash
CAMOUFOX_PATH="/Users/fanzhang/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox" \
node scripts/run-with-preflows.js workflows/1688/analysis/1688-simple-homepage-only.json --debug
```

## 技术要点

### 1. Camoufox反检测配置

```javascript
const launchArgs = [
  "--disable-blink-features=AutomationControlled",
  "--disable-web-security",
  "--disable-features=VizDisplayCompositor",
  "--no-first-run",
  "--disable-default-apps",
  "--disable-sync",
  "--metrics-recording-only",
  "--disable-default-browser-check",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--disable-extensions",
  "--disable-plugins-discovery",
  "--disable-ipc-flooding-protection",
  "--shuffle-messagetypes",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-features=TranslateUI",
  "--disable-features=Translate",
  "--lang=zh-CN",
  "--accept-lang=zh-CN,zh"
];
```

### 2. 反注入脚本

```javascript
await browser.addInitScript(() => {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch {}
  try { window.chrome = window.chrome || { runtime: {} }; } catch {}
  try { Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] }); } catch {}
  try { Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }); } catch {}
  // WebGL指纹伪装...
});
```

### 3. 会话管理

- **会话ID**: `sess-1760595098463-450204`
- **握手信号**: `/Users/fanzhang/.webauto/sessions/[sessionId]/login.json`
- **上下文导出**: `/Users/fanzhang/.webauto/sessions/[sessionId]/context.json`
- **行为日志**: 1194条详细操作记录

## 成功验证指标

### 1. 登录验证
- ✅ **一次通过** - 无需重试 (1/60)
- ✅ **快速验证** - 321ms内完成验证
- ✅ **无模态干扰** - 0次模态关闭操作

### 2. 页面访问
- ✅ **直接访问** - https://www.1688.com/ 无拦截
- ✅ **完整加载** - HTML 1,138,966字符
- ✅ **资源完整** - 42个内联 + 34个外部资源

### 3. Cookie状态
- ✅ **数量增加** - 166 → 174个cookies
- ✅ **跨域同步** - 淘宝系所有域名同步
- ✅ **长期有效** - 包含长期过期token

## 文件路径

### Cookie文件
- **主文件**: `/Users/fanzhang/.webauto/cookies/1688-domestic.json`
- **备份文件**: `/Users/fanzhang/.webauto/cookies/1688-domestic.backup.[timestamp].json`

### 脚本文件
- **登录脚本**: `/Users/fanzhang/Documents/github/webauto/scripts/proper-1688-login.cjs`
- **预登录配置**: `/Users/fanzhang/Documents/github/webauto/workflows/preflows/1688-login-preflow.json`

### 会话文件
- **会话目录**: `/Users/fanzhang/.webauto/sessions/`
- **握手信号**: `[sessionId]/login.json`
- **上下文文件**: `[sessionId]/context.json`
- **行为日志**: `[sessionId]/behavior-*.json`

## 注意事项

### 1. 环境变量
```bash
export CAMOUFOX_PATH="/Users/fanzhang/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox"
```

### 2. 权限设置
```bash
chmod -R 755 "/Users/fanzhang/Library/Caches/camoufox"
```

### 3. Cookie维护
- 定期备份Cookie文件
- 监控Cookie数量变化
- 验证关键认证cookie有效性

## 性能指标

- **初始化时间**: ~1.5秒
- **Cookie加载**: 166个cookies < 5ms
- **登录验证**: 321ms
- **页面加载**: 617ms (domcontentloaded)
- **总流程时间**: ~15秒

## 故障排除

### 1. 如果遇到风控
- 检查Cookie数量是否 < 150个
- 验证 `__cn_logon__` 是否为 "true"
- 确认Camoufox路径正确

### 2. 如果登录验证失败
- 检查Cookie是否过期
- 重新运行手动登录脚本
- 验证网络连接

### 3. 如果页面加载异常
- 检查会话ID是否有效
- 确认上下文文件完整性
- 重新执行预登录流程

## 更新日志

- **2025-10-16**: 初始版本，174个cookies，无风控拦截
- **测试环境**: macOS, Camoufox 0.4.11+
- **验证状态**: ✅ 完全成功

---

*本文档记录了经过实际测试验证的1688反风控完整解决方案。*