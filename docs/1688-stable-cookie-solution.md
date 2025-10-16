# 1688稳定Cookie保存方案

## 概述

本方案提供了完整的1688登录cookie管理解决方案，包括：
- CookieManager：专业的cookie管理模块
- 稳定Cookie保存脚本：自动化的cookie保存工具
- 稳定预登录workflow：基于Camoufox的预登录流程

## 核心组件

### 1. CookieManager模块 (`scripts/cookie-manager.cjs`)

功能完整的cookie管理器，提供以下功能：

#### 主要方法：
- `saveCookies(cookies, options)` - 保存完整cookie集合
- `loadCookies(source)` - 加载cookies（支持主文件或最新备份）
- `validateLoginStatus(cookies)` - 验证登录状态
- `getCookieStats(cookies)` - 获取cookie统计信息
- `createBackup(cookies)` - 创建时间戳备份
- `listBackups()` - 列出所有备份文件
- `cleanupOldBackups()` - 清理旧备份（保留最近10个）
- `checkMainCookieFile()` - 检查主cookie文件状态

#### 特性：
- ✅ 自动验证登录状态（检查`__cn_logon__`等关键cookie）
- ✅ 域名统计和安全分析
- ✅ 自动备份和清理机制
- ✅ 完整的错误处理
- ✅ 支持从备份恢复

### 2. 稳定Cookie保存脚本 (`scripts/stable-1688-cookie-saver.cjs`)

基于CookieManager的自动化cookie保存脚本。

#### 功能特点：
- 🚀 使用Camoufox浏览器进行反检测
- 📦 智能cookie状态检查和报告
- 🔍 多重登录状态验证（cookie、页面元素、URL）
- 💾 自动创建备份和统计报告
- 🛡️ 完整的反检测配置
- 📊 详细的域名和安全统计

#### 使用方法：
```bash
node scripts/stable-1688-cookie-saver.cjs
```

### 3. 稳定预登录workflow (`workflows/preflows/1688-stable-preflow.json`)

完整的预登录workflow，包含以下节点：

1. **CamoufoxEnsureNode** - 确保Camoufox可用
2. **BrowserInitNode** - 浏览器初始化（完整反检测配置）
3. **CookieInjectionNode** - Cookie注入（支持域名过滤和备份回退）
4. **NavigateNode** - 导航到1688主页
5. **LoginVerificationNode** - 登录状态验证
6. **SessionValidationNode** - 会话验证（API访问测试）
7. **SessionFinalizeNode** - 会话终结（保持浏览器打开）

## 当前状态

### Cookie状态（最新检查）：
- **总数**: 174个cookies
- **登录状态**: ✅ 已登录
- **用户ID**: viridite
- **会员ID**: b2b-28217351
- **文件大小**: 38,453 bytes
- **最后更新**: 2025-10-16T06:11:49.368Z

### 域名分布：
- `.taobao.com`: 37个
- `.tmall.com`: 30个
- `.1688.com`: 30个
- `.tmall.hk`: 23个
- `.fliggy.com`: 23个
- `.mmstat.com`: 7个
- 其他域名: 24个

### 安全统计：
- **HttpOnly**: 50个cookies
- **Secure**: 128个cookies
- **Session**: 92个cookies

## 使用指南

### 1. Cookie保存和维护

定期使用稳定Cookie保存脚本来更新cookies：

```bash
# 运行cookie保存脚本
node scripts/stable-1688-cookie-saver.cjs

# 检查cookie状态
node -e "
const CookieManager = require('./scripts/cookie-manager.cjs');
const manager = new CookieManager();
console.log(JSON.stringify(manager.checkMainCookieFile(), null, 2));
"
```

### 2. 在workflow中使用预登录

```bash
# 使用稳定预登录workflow
node scripts/run-with-preflows.js workflows/preflows/1688-stable-preflow.json --debug
```

### 3. Cookie备份管理

```bash
# 查看所有备份
node -e "
const CookieManager = require('./scripts/cookie-manager.cjs');
const manager = new CookieManager();
console.log('备份列表:', manager.listBackups());
"

# 从最新备份恢复
node -e "
const CookieManager = require('./scripts/cookie-manager.cjs');
const manager = new CookieManager();
const cookies = manager.loadCookies('latest-backup');
console.log('从备份加载了', cookies ? cookies.length : 0, '个cookies');
"
```

## 最佳实践

### 1. 定期维护
- 每周运行一次cookie保存脚本以确保cookies最新
- 定期检查备份文件数量
- 监控登录状态变化

### 2. 安全注意事项
- Cookie文件包含敏感登录信息，请妥善保管
- 定期清理过期的备份文件
- 不要将cookie文件提交到版本控制系统

### 3. 故障排除

#### 登录状态丢失：
1. 运行cookie保存脚本重新登录
2. 检查`__cn_logon__`cookie值是否为`true`
3. 验证cookie文件完整性

#### Cookie数量异常：
1. 使用CookieManager检查文件状态
2. 从备份恢复之前的版本
3. 重新运行登录流程

#### Workflow失败：
1. 检查Camoufox是否正确安装
2. 验证cookie文件路径和权限
3. 查看workflow日志获取详细错误信息

## 技术细节

### Cookie验证逻辑
```javascript
// 关键登录cookie检查
const loginCookie = cookies.find(c => c.name === '__cn_logon__');
const isLoggedIn = loginCookie && loginCookie.value === 'true';

// 用户信息检查
const userIdCookie = cookies.find(c => c.name === '__cn_logon_id__');
const memberCookie = cookies.find(c => c.name === 'last_mid');
```

### 反检测配置
- 使用Camoufox浏览器（Firefox + C++级指纹修改）
- 完整的浏览器参数配置
- 注入反检测JavaScript脚本
- 设置合适的请求头和User-Agent

### 备份策略
- 每次保存都创建时间戳备份
- 自动清理保留最近10个备份
- 支持从任意备份恢复

## 文件结构

```
webauto/
├── scripts/
│   ├── cookie-manager.cjs          # Cookie管理模块
│   ├── stable-1688-cookie-saver.cjs # 稳定cookie保存脚本
│   └── ...
├── workflows/
│   └── preflows/
│       └── 1688-stable-preflow.json # 稳定预登录workflow
├── docs/
│   └── 1688-stable-cookie-solution.md # 本文档
└── ~/.webauto/
    └── cookies/
        ├── 1688-domestic.json       # 主cookie文件
        └── 1688-domestic.backup.*.json # 备份文件
```

## 更新日志

### v1.0.0 (2025-10-16)
- ✅ 创建CookieManager模块
- ✅ 实现稳定Cookie保存脚本
- ✅ 创建稳定预登录workflow
- ✅ 完成文档和使用指南
- ✅ 验证174个cookies的有效登录状态