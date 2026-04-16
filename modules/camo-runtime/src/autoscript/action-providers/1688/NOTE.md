# 1688 平台自动化 - 页面锚点分析笔记

## 1. 登录状态检测锚点

### 1.1 已登录状态锚点
**页面**: https://www.1688.com/ (首页)
**检测时机**: 页面加载完成后

| 锚点 | Selector | 特征 | 用途 |
|------|----------|------|------|
| userCard | `[class*="userCard"]` | 包含用户信息区域 | 登录成功的主锚点 |
| nick | `[class*="nick"]` | 显示用户名文本，如 "中午好，viridite" | 判断是否已登录 |
| avatar | `[class*="userCard"] img` | 用户头像图片 | 辅助锚点 |

**登录成功判断逻辑**:
```javascript
const nick = document.querySelector('[class*="nick"]');
const isLoggedIn = nick && nick.textContent.trim().length > 0 && !nick.textContent.includes('登录');
```

**注意**: 已登录状态下 `[class*="loginBtn"]` 元素不存在。

### 1.2 未登录状态锚点
**页面**: https://www.1688.com/ (首页)

| 锚点 | Selector | 特征 | 用途 |
|------|----------|------|------|
| loginBtn | `[class*="loginBtn"]` | 显示 "立即登录" 文字 | 未登录的主锚点 |

**未登录判断逻辑**:
```javascript
const loginBtn = document.querySelector('[class*="loginBtn"]');
const isNotLoggedIn = loginBtn && loginBtn.offsetParent !== null;
```

### 1.3 Cookie 自动登录验证
**测试结果**: ✅ 成功
- Profile: `1688-test-1`
- 重启浏览器后，cookie 自动恢复登录状态
- 用户名显示正常

---

## 2. 搜索区域锚点

### 2.1 搜索框锚点
**页面**: https://www.1688.com/ (首页)

| 锚点 | Selector | 特征 | 用途 |
|------|----------|------|------|
| searchForm | `.ali-search-form, .search-common-form` | 搜索表单容器 | 搜索区域主锚点 |
| searchInput | `#alisearch-input, .ali-search-input, input[name="keywords"]` | 文本输入框 | 输入关键词 |
| searchContainer | `.ali-search-container` | 搜索容器 | 辅助锚点 |

**搜索输入框特征**:
- id: `alisearch-input`
- class: `ali-search-input`
- name: `keywords`
- type: `text`
- placeholder: 动态推荐词（如 "话筒家用k歌"）

### 2.2 搜索按钮锚点
**发现**: 搜索表单内没有明显的 button 元素，搜索可能通过：
1. 表单 submit 事件
2. 输入框回车键
3. 隐藏的可点击元素

**需要进一步验证**: 点击搜索按钮或按回车触发搜索

---

## 3. 待验证流程

### 3.1 下一步测试
1. 在搜索框输入关键词
2. 点击搜索按钮或按回车
3. 等待搜索结果页加载
4. 分析搜索结果页锚点

### 3.2 搜索结果页锚点（待分析）
- 商品列表容器
- 单个商品卡片
- 商品标题、价格、链接
- 分页控件

---

## 4. 平台特性观察

### 4.1 页面结构特点
- 首页为动态内容，大量推荐商品
- 使用阿里系 UI 组件（ali-* class prefix）
- 登录状态通过 cookie 保持，无需额外验证

### 4.2 与 XHS/微博对比
- 登录检测更简单：无复杂的 cookie 刷新机制
- 搜索框更标准：有明确的 form 和 input 元素
- 搜索按钮需要进一步确认触发方式

---

## 5. 操作记录

### 5.1 已完成操作
1. [2026-04-16] 创建 profile `1688-test-1`
2. [2026-04-16] 启动浏览器访问 https://www.1688.com
3. [2026-04-16] 点击登录按钮 `[class*="loginBtn"]`
4. [2026-04-16] 用户扫码登录成功
5. [2026-04-16] 关闭浏览器，验证 cookie 自动登录 ✅
6. [2026-04-16] 分析登录状态锚点
7. [2026-04-16] 分析搜索框锚点

### 5.2 待执行操作
1. 手动执行一次搜索，观察搜索按钮触发方式
2. 分析搜索结果页锚点
3. 编写自动化代码

---

## 6. 搜索结果页锚点（已分析）

### 6.1 搜索触发方式
**测试结果**：
- 输入关键词后，JS Enter 键事件无法触发搜索
- 表单 action 为 `https://s.1688.com/selloffer/offer_search.htm`
- **推荐方式**：直接跳转到搜索 URL（构造搜索链接）

**搜索 URL 格式**：
```
https://s.1688.com/selloffer/offer_search.htm?keywords=关键词
```

### 6.2 商品列表容器锚点
**页面**: https://s.1688.com/selloffer/offer_search.htm?keywords=XXX

| 锚点 | Selector | 特征 | 用途 |
|------|----------|------|------|
| feedsColumn | `.col-feeds` | 商品列表主容器 | 包含所有商品卡片 |
| feedsWrapper | `.feeds-wrapper` | 单个商品卡片外层 | 商品链接的父容器 |

**商品数量统计**：30 个商品链接可见（`.col-feeds` 内）

### 6.3 商品链接锚点
**商品链接特征**：
- 容器：`.col-feeds > .feeds-wrapper > a`
- 链接格式：`http://detail.m.1688.com/page/index.html?offerId=XXX&sortType=&pageId=`
- 尺寸：宽 210px，高 358px（可见商品卡片）

**商品链接提取脚本**：
```javascript
var links = document.querySelectorAll('.col-feeds .feeds-wrapper a[href*="offerId"]');
// 或
var links = document.querySelectorAll('.col-feeds > a[href*="detail.m.1688"]');
```

### 6.4 商品详情提取
**单个商品卡片结构**：
- 链接：`a[href*="offerId"]`
- 文本包含：店铺名、价格、服务等信息
- "找相似"按钮也在同一卡片内

### 6.5 其他页面元素
| 元素 | Selector | 说明 |
|------|----------|------|
| searchTab | `.search-tab-section` | "找货源"、"工业品" 标签 |
| spaceContent | `.space-pc-ui2024-content` | 顶部区域 |

---

## 7. 操作流程总结

### 7.1 登录验证流程
1. 启动浏览器访问 https://www.1688.com
2. 检测 `[class*="nick"]` 是否有内容且不含 "登录"
3. 若已登录：继续执行
4. 若未登录：等待用户手动扫码登录

### 7.2 搜索流程
1. 构造搜索 URL：`https://s.1688.com/selloffer/offer_search.htm?keywords=关键词`
2. 跳转到搜索结果页
3. 等待 `.col-feeds` 容器出现
4. 提取 `.feeds-wrapper a[href*="offerId"]` 链接

### 7.3 商品链接提取流程
1. 检测 `.col-feeds` 是否存在
2. 获取所有 `.feeds-wrapper` 内的链接
3. 过滤有效链接（href 包含 offerId）
4. 提取 offerId 参数用于后续详情页访问

---

## 8. 待开发模块

### 8.1 需要创建的文件
- `common.mjs` - 公共函数（devtoolsEval, runCamo 等）
- `selectors.mjs` - 锚点 selector 定义
- `login-ops.mjs` - 登录状态检测
- `search-ops.mjs` - 搜索操作
- `collect-ops.mjs` - 商品链接采集
- `persistence.mjs` - 数据持久化

### 8.2 优先级
1. P0: `common.mjs`, `selectors.mjs`, `login-ops.mjs`
2. P0: `search-ops.mjs` - 搜索跳转
3. P0: `collect-ops.mjs` - 链接采集
4. P1: `persistence.mjs` - 数据保存
5. P2: 详情页操作（待后续分析）

---

## 9. 测试记录

### 9.1 已完成测试
- [2026-04-16] 登录验证 ✅
- [2026-04-16] Cookie 自动登录 ✅
- [2026-04-16] 搜索跳转 ✅
- [2026-04-16] 商品链接定位 ✅

### 9.2 截图证据
- `~/.webauto/download/1688/debug/search-input-state.png` - 搜索框输入状态
- `~/.webauto/download/1688/debug/search-result-page.png` - 搜索结果页

---

## 10. 风控教训（2026-04-16）

### 10.1 风控触发原因
- **高频使用 devtools eval（页面 JS）**
- 系统检测到自动化行为特征
- **必须改用 camo CLI 命令模拟人类操作**

### 10.2 正确的操作方式（参考小红书）
| 操作类型 | 正确方式 | 禁止方式 |
|---------|---------|---------|
| 点击 | `camo click profileId selector` | `element.click()` / JS dispatchEvent |
| 输入 | `camo type profileId selector text` | `element.value = x` / JS focus |
| 滚动 | `camo scroll profileId --down --amount 300` | `window.scrollTo()` / JS scroll |
| 状态读取 | `evaluateReadonly`（低频，仅读状态） | 高频 JS 执行 |

### 10.3 评估脚本使用原则
- `evaluateReadonly` 仅用于**锚点检测**（判断页面状态）
- 每次操作间隔必须 >= 1s
- 禁止在循环中高频调用 evaluate
- 禁止用 JS 触发任何交互行为

### 10.4 操作流程修正
1. 登录验证：evaluateReadonly（一次）检测 `[class*="nick"]`
2. 搜索跳转：camo goto（构造 URL 直达）
3. 商品链接采集：evaluateReadonly（一次）读取 `.col-feeds` 内链接
4. 详情页进入：camo click 商品链接
5. 所���交互操作：camo CLI

---

## 11. 重构计划

### 11.1 删除旧文件
- `common.mjs` - 使用 spawnSync 高频调用 camo（错误方式）

### 11.2 新建文件（参考 XHS）
- `dom-ops.mjs` - 使用 camo CLI 进行 click/type/scroll
- `search-ops.mjs` - 搜索操作（goto + scroll）
- `collect-ops.mjs` - 商品链接采集（一次 evaluateReadonly）
- `login-ops.mjs` - 登录检测（一次 evaluateReadonly）
- `selectors.mjs` - 锚点定义

### 11.3 复用 XHS 模块
- `evaluateReadonly` - 从 `xhs/dom-ops.mjs` 复用
- `sleep/sleepRandom` - 从 `xhs/dom-ops.mjs` 复用
- `waitForAnchor` - 从 `xhs/dom-ops.mjs` 复用

### 11.4 优先级
1. P0: 复用 XHS dom-ops.mjs 的基础能力
2. P0: 1688 选择器定义
3. P0: 登录检测（一次 evaluateReadonly）
4. P0: 搜索跳转（camo goto）
5. P0: 商品链接采集（一次 evaluateReadonly）

---

## 12. 待执行操作（修正版）

### 12.1 下一步
1. 启动浏览器（camo start）
2. 检测登录状态（一次 evaluateReadonly）
3. 构造搜索 URL 直接跳转（camo goto）
4. 等待锚点出现（waitForAnchor）
5. 读取商品链接（一次 evaluateReadonly）
6. 记录 NOTE.md
7. 退出浏览器

---

## 13. 手动测试结果（2026-04-16 第二次）

### 13.1 登录状态检测 ✅
- **锚点**: `[class*="nick"]`
- **结果**: `{ isLoggedIn: true, nickText: "中午好，viridite" }`
- **结论**: cookie 登录有效，无需手动扫码

### 13.2 搜索页跳转 ✅
- **协议**: `callAPI('goto', { profileId, url })`
- **URL**: `https://s.1688.com/selloffer/offer_search.htm?keywords=蓝牙耳机`
- **结果**: `{ ok: true }`
- **结论**: 协议级 goto 成功

### 13.3 搜索结果页就绪检测 ✅
- **锚点**: `.col-feeds`
- **结果**: `{ ready: true, linkCount: 90, url: "..." }`
- **结论**: 搜索结果页锚点正确，共 90 个商品链接

### 13.4 商品链接采集 ✅
- **锚点**: `.col-feeds .feeds-wrapper a[href*="offerId"]`
- **结果**: 成功采集 4 个有效链接（前10个中）
- **链接格式**: `http://detail.m.1688.com/page/index.html?offerId=xxx&...`
- **offerId 提取**: 正则 `/offerId=(\d+)/` 有效

### 13.5 关键发现
1. **链接格式是 mobile 格式**：`detail.m.1688.com` 而非 `detail.1688.com`
2. **text 内容包含无关信息**：需要更精准的标题 selector
3. **筛选条件有效**：`rect.width > 30 && rect.height > 30 && offsetParent !== null`
4. **单次 evaluateReadonly 足够**：无需高频调用

### 13.6 协议级操作验证
| 操作 | 协议 | 结果 |
|------|------|------|
| 页面跳转 | `callAPI('goto', ...)` | ✅ |
| 状态读取 | `runEvaluateScript(...)` | ✅（仅单次） |
| 点击 | `callAPI('mouse:click', ...)` | 待测试 |
| 滚动 | `callAPI('scroll', ...)` | 待测试 |
| 按键 | `callAPI('keyboard:press', ...)` | 待测试 |

---

## 14. 下一步

1. ✅ 登录检测完成
2. ✅ 搜索跳转完成
3. ✅ 商品链接采集完成
4. TODO: 滚动加载更多商品
5. TODO: 进入商品详情页
6. TODO: 详情页锚点分析

---

## 15. 新需求（2026-04-16）

### 15.1 问题修正
1. **搜索关键字编码问题** - 需要检查正确的 URL 编码方式
2. **搜索结果需要提取更多信息**：
   - 公司名称
   - 公司旺旺联系方式
   - 旺旺直达链接

### 15.2 公司详情页需求
进入公司账号页面后提取：
- 公司名
- 联系人
- 邮箱

做成可重复流程。

### 15.3 分析计划
1. 重新分析搜索结果页结构（公司名、旺旺位置）
2. 分析公司详情页结构（邮箱、联系人位置）
3. 定义新锚点
4. 固化流程

---

## 16. 搜索结果页结构分析（2026-04-16）

### 16.1 商品卡片锚点 ✅
| 字段 | Selector | 说明 |
|------|----------|------|
| 商品卡片 | `.search-offer-wrapper.search-offer-item` | 每个 item 是一个商品 |
| offerId | `href.match(/offerId=(\d+)/)` | 从商品链接提取 |
| 商品详情链接 | `item.href` | `http://detail.m.1688.com/page/index.html?offerId=xxx` |

### 16.2 公司信息锚点 ✅
| 字段 | Selector | 说明 |
|------|----------|------|
| 公司名 | `.offer-shop-row .col-left a .desc-text` | 例：义乌市莱柠电子商务有限公司 |
| 店铺链接 | `.offer-shop-row .col-left a` href | 例：`http://shop293418444l341.1688.com/` |

### 16.3 旺旺信息锚点 ✅
| 字段 | Selector | 说明 |
|------|----------|------|
| 旺旺元素 | `.J_WangWang` | span 标签 |
| 旺旺昵称(编码) | `.J_WangWang[data-nick]` | URL 编码，需 decodeURIComponent |
| 旺旺昵称(解码) | decodeURIComponent(data-nick) | 例：莱柠饰品批发 |
| 旺旺链接 | `.J_WangWang a` href | 直达聊天窗口 |

### 16.4 旺旺链接格式
```
https://air.1688.com/app/ocms-fusion-components-1688/def_cbu_web_im/index.html
  ?uid=<encoded_nick>      # 旺旺昵称（URL编码）
  &site=cnalichn           # 站点
  &fromid=cnalichn<当前用户> # 发起方
  &offerId=<offerId>       # 关联商品
```

### 16.5 数据采集脚本（单次 evaluateReadonly）
```javascript
(() => {
  var items = document.querySelectorAll('.search-offer-wrapper.search-offer-item');
  var results = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var href = item.href || '';
    var offerIdMatch = href.match(/offerId=(\\d+)/);
    var offerId = offerIdMatch ? offerIdMatch[1] : null;
    
    var shopLink = item.querySelector('.offer-shop-row .col-left a');
    var companyName = shopLink ? shopLink.querySelector('.desc-text').textContent.trim() : null;
    var shopUrl = shopLink ? shopLink.href : null;
    
    var wwSpan = item.querySelector('.J_WangWang');
    var wwNickEncoded = wwSpan ? wwSpan.getAttribute('data-nick') : null;
    var wwNick = wwNickEncoded ? decodeURIComponent(wwNickEncoded) : null;
    var wwLink = wwSpan ? wwSpan.querySelector('a') : null;
    var wwHref = wwLink ? wwLink.href : null;
    
    results.push({
      offerId, companyName, shopUrl, wwNick, wwHref
    });
  }
  return { ok: true, count: results.length, results };
})()
```

---

## 17. 下一步：店铺页面分析

需要进入店铺页面提取：
- 公司名（完整）
- 联系人
- 邮箱

---

## 18. 店铺联系方式页面分析（2026-04-16）

### 18.1 进入方式
- **协议操作**: `callAPI('goto', { profileId, url: shopUrl + '/page/contactinfo.htm' })`
- **或点击**: `.contactinfo` 元素 → 自动跳转到联系方式页面

### 18.2 店铺联系方式锚点 ✅
| 字段 | 提取方式 | 示例 |
|------|----------|------|
| 公司名 | `#pcMainCompanyNameV2` textContent | 义乌市莱柠电子商务有限公司 |
| 手机号 | div 直接文本匹配 `^1[3-9][0-9]{9}$` | 15257978279 |
| 地址 | div 直接文本含"街道/村/幢" | 义乌市北苑街道柳二村柳青八区73幢3单元201室 |
| 联系人 | div 直接文本以"先生/女士"结尾 | 金德松女士 |
| 主营类目 | `#pcV2MainCateLabel` textContent | 主营类目: 服饰配件、饰品 |
| 入驻年限 | `#pcV2SellerTagYear` textContent | 入驻1年 |
| 成立时间 | div 直接文本含"成立" | 2025.10成立 |
| 地区 | div 直接文本含省份名 | 浙江 金华 |

### 18.3 邮箱情况
- 当前测试店铺无邮箱字段
- 可能需要进入其他页面或查看更多详情
- 部分店铺可能不公开邮箱

### 18.4 数据采集脚本（单次 evaluateReadonly）
```javascript
(() => {
  var companyName = document.querySelector('#pcMainCompanyNameV2')?.textContent.trim();
  var mainCate = document.querySelector('#pcV2MainCateLabel')?.textContent.trim();
  var sellerYears = document.querySelector('#pcV2SellerTagYear')?.textContent.trim();
  
  var allDivs = document.querySelectorAll('div');
  var phone = null, address = null, contactPerson = null, founded = null, region = null;
  
  for (var i = 0; i < allDivs.length; i++) {
    var text = '';
    for (var j = 0; j < allDivs[i].childNodes.length; j++) {
      if (allDivs[i].childNodes[j].nodeType === 3) text += allDivs[i].childNodes[j].textContent.trim();
    }
    text = text.trim();
    if (!text || text.length > 100) continue;
    
    if (/^1[3-9][0-9]{9}$/.test(text)) phone = text;
    if (text.endsWith('先生') || text.endsWith('女士')) contactPerson = text;
    if ((text.includes('街道') || text.includes('村') || text.includes('幢')) && text.length > 15) address = text;
    if (text.includes('成立') && text.length < 15) founded = text;
    if (/^(浙江|广东|江苏|上海|北京|福建|山东|河南|河北|四川|湖北|湖南|安徽)\s+/.test(text)) region = text;
  }
  
  return { ok: true, companyName, phone, address, contactPerson, mainCate, sellerYears, founded, region };
})()
```

---

## 19. 完整流程总结

### 19.1 搜索结果采集
1. `goto` 搜索页 URL（关键字已编码）
2. 等待 `.col-feeds` 锚点出现
3. 单次 `evaluateReadonly` 提取所有商品信息：
   - offerId、companyName、shopUrl、wwNick、wwHref

### 19.2 店铺联系方式采集
1. `goto` 店铺联系方式页（`shopUrl/page/contactinfo.htm`）
2. 单次 `evaluateReadonly` 提取：
   - companyName、phone、address、contactPerson、mainCate、sellerYears、founded、region

### 19.3 协议级操作原则
- ✅ `callAPI('goto', ...)` 页面跳转
- ✅ `callAPI('mouse:click', ...)` 点击
- ✅ `runEvaluateScript(...)` 单次状态读取（有 timeout）
- ❌ 禁止高频调用
- ❌ 禁止页面内 JS 操作

---

## 20. 下一步
1. 实现自动化脚本
2. 添加滚动加载更多商品
3. 测试其他店铺是否有邮箱字段

---

## 21. 邮箱字段验证（2026-04-16）

### 21.1 测试结果
测试 4 家店铺联系方式页面，**均无公开邮箱字段**：

| 店铺 | 公司名 | 电话 | 联系人 | 邮箱 |
|------|--------|------|--------|------|
| shop293418444l341 | 义乌市莱柠电子商务有限公司 | 15257978279 | 金德松女士 | ❌ 无 |
| shop39299561b2b38 | 海丰县德饰缘首饰有限公司 | ❌ 无 | 陈惠贞女士 | ❌ 无 |
| shop39243q92y00f8 | 义乌市仙茜饰品商行 | ❌ 无 | 周自力女士 | ❌ 无 |
| shop126f7x9w3s425 | 义乌市伊对饰品有限公司 | ❌ 无 | 葛永霞女士 | ❌ 无 |

### 21.2 结论
- 1688 平台店铺联系方式页面**普遍不公开邮箱**
- 部分店铺不公开手机号
- 主要联系方式：旺旺、联系人、地址
- **建议**：邮箱可通过以下方式获取：
  1. 企业官网搜索（需额外流程）
  2. 旺旺沟通询问
  3. 搜索引擎查询企业名称

---

## 22. 最终采集数据结构

### 22.1 搜索结果数据
```javascript
{
  offerId: "1039436648679",           // 商品ID
  companyName: "义乌市莱柠电子商务有限公司", // 公司名
  shopUrl: "http://shop293418444l341.1688.com/", // 店铺链接
  wwNick: "莱柠饰品批发",              // 旺旺昵称
  wwHref: "https://air.1688.com/app/..." // 旺旺直达链接
}
```

### 22.2 店铺联系方式数据
```javascript
{
  companyName: "义乌市莱柠电子商务有限公司",
  phone: "15257978279",               // 可能为 null
  address: "义乌市北苑街道柳二村...",
  contactPerson: "金德松女士",
  mainCate: "主营类目: 服饰配件、饰品",
  sellerYears: "入驻1年",
  founded: "2025.10成立",
  region: "浙江 金华",                // 可能为 null
  email: null                         // 普遍为 null
}
```

---

## 23. 自动化实现建议

### 23.1 流程
1. **搜索页采集** → 提取 companyUrl 列表
2. **批量访问店铺联系方式页** → 提取详细信息
3. **写入 JSONL** → company-info-{keyword}.jsonl

### 23.2 限制
- 单次 evaluateReadonly timeout: 10000ms
- 店铺页面等待: 3000ms（避免高频）
- 搜索关键字需 URL 编码
- 部分字段可能为 null（phone、email）

### 23.3 锚点驱动
- 搜索页锚点: `.col-feeds` 存在
- 店铺页锚点: `#pcMainCompanyNameV2` 存在

---

## 24. 完整采集流程实现（2026-04-16）

### 24.1 文件结构
```
modules/camo-runtime/src/autoscript/action-providers/1688/
├── SKILL.md              # Skill 使用说明
├── NOTE.md               # 手动分析笔记（本文件）
├── selectors.mjs         # 锚点定义和采集脚本
├── dom-ops.mjs           # DOM 操作（协议级）
├── login-ops.mjs         # 登录操作
├── search-ops.mjs        # 搜索操作
├── collect-ops.mjs       # 商品信息采集
├── shop-ops.mjs          # 店铺联系方式采集
```

### 24.2 数据采集流程
```javascript
// 1. 搜索关键字采集商品信息
const searchResult = await gotoSearchResult(profileId, '蓝牙耳机');
const offerInfo = await collectOfferInfo(profileId);
// 返回: { offerId, companyName, shopUrl, wwNick, wwHref, href }

// 2. 进入店铺联系方式页采集详细信息
const shopContact = await collectShopContact(profileId, shopUrl);
// 返回: { companyName, phone, address, contactPerson, mainCate, sellerYears, founded, region, email }

// 3. 批量采集
const batchResult = await collectOfferInfoBatch(profileId, ['蓝牙耳机', '数据线']);
const shopContacts = await collectShopContactsBatch(profileId, batchResult.allShopUrls);
```

### 24.3 协议级操作原则 ✅
| 操作 | 协议级 API | 说明 |
|------|------------|------|
| 页面跳转 | `callAPI('goto', ...)` | 不使用 JS |
| 点击 | `callAPI('mouse:click', ...)` | 不使用 JS |
| 滚动 | `callAPI('scroll', ...)` | 不使用 JS |
| 键盘输入 | `callAPI('keyboard:type', ...)` | 不使用 JS |
| 状态读取 | `runEvaluateScript(...)` | 单次调用，有 timeout |

### 24.4 避免风控的关键
- ❌ 禁止高频触发同样操作
- ❌ 禁止页面内 JS 触发交互
- ✅ 使用协议级 API（模拟真实用户）
- ✅ 操作间增加等待间隔（1500ms ~ 3000ms）
- ✅ 锚点驱动（等待元素出现再操作）
- ✅ 单次 evaluateReadonly（低频状态读取）

### 24.5 数据结构汇总
```javascript
// 搜索结果商品信息
{
  offerId: "1039436648679",
  companyName: "义乌市莱柠电子商务有限公司",
  shopUrl: "http://shop293418444l341.1688.com/",
  wwNick: "莱柠饰品批发",
  wwHref: "https://air.1688.com/app/...",
  href: "https://detail.1688.com/offer/..."
}

// 店铺联系方式
{
  companyName: "义乌市莱柠电子商务有限公司",
  phone: "15257978279",               // 可能为 null
  address: "义乌市北苑街道柳二���...",
  contactPerson: "金德松女士",
  mainCate: "主营类目: 服饰配件、饰品",
  sellerYears: "入驻1年",
  founded: "2025.10成立",
  region: "浙江 金华",                // 可能为 null
  email: null                         // 普遍为 null
}
```

---

## 25. 下一步任务
1. 实现滚动加载更多商品（协议级 scroll）
2. 实现自动化 CLI 入口（webauto 1688 collect）
3. 添加持久化存储（JSONL 写入）
4. 添加断点续传机制

---

## 26. 测试结果（2026-04-16）

### 26.1 登录检测 ✅
```json
{
  "ok": true,
  "isLoggedIn": true,
  "nickText": "下午好，viridite",
  "loginBtnVisible": false,
  "url": "https://www.1688.com/"
}
```

### 26.2 搜索关键字编码 ✅
```
keywords=%E8%93%9D%E7%89%99%E8%80%B3%E6%9C%BA  // "蓝牙耳机" 正确编码
```

### 26.3 商品信息采集 ✅
```json
{
  "offerId": "1042503568477",
  "companyName": "镇江市莱与登电子商务有限公司",
  "shopUrl": "http://shop0r734247x7313.1688.com/",
  "wwNick": "莱登电子商务有限公司",
  "wwHref": "https://air.1688.com/app/ocms-fusion-components-1688/def_cbu_web_im/index.html?uid=...",
  "href": "http://detail.m.1688.com/page/index.html?offerId=..."
}
```

### 26.4 店铺联系方式采集 ✅
```json
{
  "companyName": "广州乐盈化妆品科技有限公司",
  "phone": null,
  "address": "广东越秀区农林下路81号之一11A自编1532房",
  "contactPerson": "朱玉娥女士",
  "mainCate": "主营类目: 美容护肤/彩妆",
  "sellerYears": "入驻1年",
  "founded": "2025.08成立",
  "region": "广东 广州",
  "email": null
}
```

### 26.5 已实现完整流程
```
1. 登录检测 → checkLoginStatus()
2. 搜索跳转 → gotoSearchResult(keyword)  # URL 编码正确
3. 商品信息采集 → collectOfferInfo()    # offerId + companyName + shopUrl + wwNick + wwHref
4. 店铺联系方式采集 → collectShopContact(shopUrl)  # companyName + contactPerson + address + mainCate + sellerYears + founded + region
```

---

## 27. CLI 入口（已实现）

```bash
# 搜索商品信息
webauto 1688 collect --profile 1688-test-1 --keyword "蓝牙耳机"

# 采集店铺联系方式
webauto 1688 collect --profile 1688-test-1 --keyword "数据线" --do-shop-contact

# 输出路径
~/.webauto/download/1688/debug/<keyword>/offer-info.jsonl
~/.webauto/download/1688/debug/<keyword>/shop-contact.jsonl
```

---

## 28. 协议级操作原则（已固化）

| 禁止 | 允许 |
|------|------|
| ❌ 页面内 JS 触发交互 | ✅ callAPI('goto', ...) |
| ❌ 高频重复操作 | ✅ callAPI('mouse:click', ...) |
| ❌ 直接 DOM 操作 | ✅ callAPI('scroll', ...) |
| ❌ 无 timeout evaluate | ✅ evaluateReadonly(timeoutMs: 10000) |
| ❌ 无等待间隔 | ✅ sleep(2000~3000) |

---

## 29. 后续任务
1. 实现滚动加载更多商品（协议级 scroll）
2. 实现 daemon 调度入口
3. 添加风控检测（页面异常锚点）
4. 添加持久化去重（跨 run 去重）
