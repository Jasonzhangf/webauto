# 1688批量聊天自动化系统

## 🎯 项目目标

实现1688平台的自动化搜索、商家信息提取、去重处理和批量聊天功能。

## 🔑 关键发现

### 1. URL编码问题
- **问题**: 1688搜索页面使用GBK编码而非UTF-8
- **解决方案**: "服装" → `%B7%FE%D7%B0` (GBK) 而不是 `%E6%9C%8D%E8%A3%85` (UTF-8)
- **参考链接**: `https://s.1688.com/selloffer/offer_search.htm?keywords=%B7%FE%D7%B0&spm=a26352.13672862.searchbox.0`

### 2. 商家页面结构
- **搜索结果页**: `https://s.1688.com/selloffer/offer_search.htm`
- **商家选择器**: `.sm-offer-item`, `.offer-item`, `.sm-offer`, `[class*=offer]`
- **聊天页面**: `https://air.1688.com/app/ocms-fusion-components-1688/def_cbu_web_im_core/index.html`
- **商家ID提取**: 从URL中提取 `member_id=` 或 `/数字.htm` 格式

### 3. Cookie系统
- **标准Cookie文件**: `~/.webauto/cookies/1688-domestic.json`
- **Cookie数量**: 171个完整Cookie，无风控风险
- **登录验证**: 使用`.userAvatarLogo img`选择器

## 🏗️ 系统架构

### 核心组件
1. **搜索模块**: 基于GBK编码的关键字搜索
2. **提取模块**: 商家信息提取和ID识别
3. **去重模块**: 基于merchantId的历史记录去重
4. **聊天模块**: 使用ChatHighlightOnlyNode1688进行mock发送
5. **历史记录**: localStorage持久化发送历史

### 工作流文件
- `1688-search-simple.json`: 搜索分析基础流程
- `1688-simple-batch-chat.json`: 完整批量聊天系统
- `1688-batch-merchant-chat-system.json`: 高级版本(需要自定义节点)

## 🚀 使用方法

### 1. 基础搜索分析
```bash
CAMOUFOX_PATH="/path/to/camoufox" node scripts/run-with-preflows.js workflows/1688/analysis/1688-search-simple.json --debug
```

### 2. 批量聊天系统
```bash
CAMOUFOX_PATH="/path/to/camoufox" node scripts/run-with-preflows.js workflows/1688/batch/1688-simple-batch-chat.json --debug
```

## 📊 功能特性

### ✅ 已实现功能
- [x] 1688主页登录和Cookie管理
- [x] GBK编码关键字搜索
- [x] 商家信息批量提取
- [x] 基于merchantId的去重处理
- [x] 发送历史记录持久化
- [x] Mock聊天消息发送
- [x] 分页支持检测

### 🔄 核心流程
1. **预登录**: 使用1688-login-preflow确保登录状态
2. **搜索**: 直接导航到GBK编码的搜索结果页
3. **提取**: 从搜索结果提取商家信息(限制10个避免过载)
4. **去重**: 检查历史记录，过滤已发送商家
5. **聊天**: 逐个打开聊天页面发送mock消息
6. **记录**: 保存发送历史到localStorage
7. **循环**: 处理下一个商家或结束

## 📝 数据结构

### 商家信息
```json
{
  "index": 0,
  "merchantId": "123456789",
  "title": "商品标题",
  "merchantName": "商家名称",
  "price": "价格信息",
  "merchantLink": "商家链接",
  "contactLink": "联系方式链接",
  "isNew": true
}
```

### 历史记录
```json
{
  "merchantId": {
    "merchantId": "123456789",
    "merchantName": "商家名称",
    "title": "商品标题",
    "sentAt": "2025-10-16T08:17:48.890Z",
    "message": "发送的消息内容",
    "status": "sent"
  }
}
```

## ⚠️ 注意事项

1. **编码问题**: 必须使用GBK编码构造搜索URL
2. **频率控制**: 消息发送间隔3-5秒避免风控
3. **Cookie更新**: 定期使用Camoufox重新登录更新Cookie
4. **数据持久化**: 历史记录存储在localStorage中
5. **Mock模式**: 当前使用mock发送，实际发送需要配置

## 🔧 配置参数

### 搜索配置
- 关键字: "服装" (GBK: %B7%FE%D7%B0)
- 每页处理: 10个商家
- 总页数: 支持分页检测

### 聊天配置
- 消息内容: "您好，请问这个产品有现货吗？"
- 发送模式: mock (模拟)
- 高亮时间: 2000ms
- 间隔时间: 3-5秒

## 📈 性能优化

1. **批量限制**: 每次最多处理10个商家
2. **去重机制**: 避免重复发送同一商家
3. **会话复用**: 使用AttachSessionNode保持登录状态
4. **错误处理**: 单个商家失败不影响整体流程

## 🐛 故障排除

### 常见问题
1. **搜索结果乱码**: 检查URL编码是否为GBK
2. **登录失败**: 确认Cookie文件有效且未过期
3. **聊天页面打不开**: 检查商家链接和UID格式
4. **历史记录丢失**: 检查localStorage权限

### 调试方法
- 使用`--debug`参数查看详细日志
- 检查`workflows/records/`目录下的结果文件
- 查看浏览器控制台输出
- 检查截图文件确认页面状态

---

**更新时间**: 2025-10-16
**版本**: 1.0.0
**状态**: 已验证基础功能正常