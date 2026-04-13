# 微博特别关注新帖监控设计文档

## 概述

实现微博"特别关注"分组用户的新帖监控功能：
- 动态发现特别关注分组 URL（不硬编码）
- 提取用户 UID 列表
- 定时巡检用户主页新帖
- 发现新帖时汇报

## 架构分层

| 层级 | 目录 | 职责 |
|------|------|------|
| L0 Shared | `shared/` | API 客户端、通用工具 |
| L1 Provider | `action-providers/weibo/` | 微博 DOM 提取、风控检测 |
| L2 Orchestrator | `apps/webauto/entry/weibo-monitor.mjs` | 监控流程编排、定时巡检 |

## 核心模块

### 1. 动态发现特别关注分组 URL

#### 入口流程
```
1. 访问首页 weibo.com
2. 点击头像 → 弹出用户菜单
3. 点击"我的关注" → 进入关注列表页
4. 从左侧分组导航找到"特别关注"链接
   - 提取 href: /u/page/follow/{uid}/followGroup?tabid={tabid}
   - 记录用户 UID 和分组 tabid
```

#### 选择器
```javascript
// 头像链接（获取当前用户 UID）
"a[href*='/u/']"  // href: /u/{uid}

// 左侧分组导航
"[class*='_side_1ubn9']" 或 "[class*='_wrap_1ubn9']"

// 特别关注分组链接
"a[href*='followGroup?tabid=']" + text.includes("特别关注")
```

### 2. 用户列表提取

#### URL 格式
```
/u/page/follow/{uid}/followGroup?tabid={tabid}
```

#### 选择器
```javascript
// 用户卡片（虚拟列表）
".vue-recycle-scroller__item-view"

// 用户链接
"a[href]" → href.match(/\/u\/(\d+)/)

// 用户名（从卡片文本第一行）
el.textContent?.trim().split("\n")[0]
```

#### 滚动加载完整列表
```javascript
// 滚动到底部加载所有用户
await scrollToBottom(profileId, {
  anchor: ".vue-recycle-scroller__item-view",
  stallRounds: 3,  // 连续 3 轮无新内容则停止
  maxScrolls: 50   // 最大滚动次数保护
});
```

### 3. 用户主页新帖检测

#### URL 格式
```
/u/{uid}
```

#### 选择器
```javascript
// 微博卡片
"[class*='card-wrap']" 或 ".wbpro-feed-item"

// 微博内容
".wbpro-feed-content" 或 "[class*='detail_wbpro_']"

// 发布时间
".wbpro-feed-time" 或 "[class*='from']"

// 微博 ID（用于唯一标识）
"a[href*='weibo.com/{uid}/{weiboId}']"
```

### 4. 定时巡检编排

#### 工作流程
```
1. 初始化：发现特别关注分组 URL，提取用户列表
2. 保存用户列表到 state 文件
3. 定时巡检（每 5-10 分钟）：
   - 对每个用户访问主页
   - 检查第一条微博
   - 对比上次记录的 weiboId
   - 发现新帖 → 提取内容 + 时间 + 链接
4. 汇报新帖：
   - 写入 state 文件（新帖记录）
   - 可选：发送通知（webhook/mailbox）
```

#### CLI 入口
```bash
webauto weibo monitor --profile xhs-qa-1 --interval 300 --output ~/.webauto/state/weibo-monitor.json
```

### 5. 风控保护

#### 强禁止规则（MEMORY.md）
```
1. ❌ 禁止用脚本试探页面寻找元素
2. ❌ 禁止在未发现目标元素时反复执行 click
3. ❌ 禁止用自动化操作摸索页面结构
```

#### 正确做法
```
1. 用户手动导航到目标页面 → 脚本只负责数据提取
2. 先用 devtools eval 探索页面结构 → 确定 selector → 单次精准 click
3. 需要探索时：先截图 → 用户确认 → 再操作
```

#### 风控信号检测
```
- 登录页面打开后立即关闭
- click 操作超时 30s
- 页面重定向到登录页
```

#### 检测逻辑
```javascript
async function checkRiskControl(profileId) {
  const url = await getCurrentUrl(profileId);
  if (url.includes("newlogin") || url.includes("login")) {
    return { riskDetected: true, reason: "redirected_to_login" };
  }
  return { riskDetected: false };
}
```

## 文件结构

```
action-providers/weibo/
├── discover-special-follow.mjs    # 动态发现特别关注分组 URL
├── extract-user-list.mjs          # 提取用户列表（含滚动）
├── check-new-posts.mjs            # 用户主页新帖检测
├── risk-control.mjs               # 风控检测
└── selectors.mjs                  # 选择器常量

apps/webauto/entry/
├── weibo-monitor.mjs              # 监控编排主入口

shared/
├── api-client.mjs                 # callAPI, fillInputValue, scrollToBottom
├── state-manager.mjs              # state 文件读写
└── time-utils.mjs                 # 时间戳比较

state/weibo-monitor.json
├── specialFollowUrl               # 特别关注分组 URL
├── userUids                       # 用户 UID 列表
├── userPostSnapshots              # 每个用户最后微博快照
│   └── {uid}: { weiboId, content, time, url }
├── newPosts                       # 新发现帖子列表
└── lastCheckTime                  # 上次巡检时间
```

## 状态文件格式

```json
{
  "specialFollowUrl": "/u/page/follow/1905728483/followGroup?tabid=3844905770314102",
  "userUids": [
    "2169039837",
    "6278171447",
    "1687813073",
    "1157864602"
  ],
  "userPostSnapshots": {
    "2169039837": {
      "weiboId": "Oabc123",
      "content": "同步��进度...",
      "time": "2026-04-07T14:30:00",
      "url": "https://weibo.com/2169039837/Oabc123"
    }
  },
  "newPosts": [],
  "lastCheckTime": "2026-04-07T14:35:00"
}
```

## 实现步骤

### Phase 1: 基础模块
1. 创建 `action-providers/weibo/selectors.mjs` - 选择器常量
2. 创建 `action-providers/weibo/discover-special-follow.mjs` - 动态发现分组 URL
3. 创建 `action-providers/weibo/extract-user-list.mjs` - 用户列表提取

### Phase 2: 新帖检测
4. 创建 `action-providers/weibo/check-new-posts.mjs` - 用户主页新帖检测
5. 创建 `action-providers/weibo/risk-control.mjs` - 风控检测

### Phase 3: 编排
6. 创建 `apps/webauto/entry/weibo-monitor.mjs` - 监控编排主入口
7. 添加 CLI 命令：`webauto weibo monitor`

### Phase 4: 验证
8. 手动 camo 验证各模块
9. E2E 测试完整流程

## 测试关键词约束

**禁止使用测试标识词作为搜索关键词**（AGENTS.md 规则）

本功能为监控类，不涉及搜索，无需关键词约束。

## 验证清单

### Phase 1
- [ ] 动态发现特别关注分组 URL 成功
- [ ] 提取用户 UID 列表完整
- [ ] 滚动加载正常（stallRounds 检测）

### Phase 2
- [ ] 用户主页新帖检测准确
- [ ] weiboId 提取正确
- [ ] 风控检测正常

### Phase 3
- [ ] 定时巡检正常启动
- [ ] state 文件读写正确
- [ ] 新帖汇报准确

### Phase 4
- [ ] 手动 camo 真机验证通过
- [ ] E2E 测试通过
- [ ] 无风控触发

## 风险与应对

| 风险 | 应对 |
|------|------|
| 微博页面结构变化 | 选择器使用 class 通配符 + 文本匹配 |
| 风控触发 | 风控检测 + 自动暂停 + 通知用户 |
| 用户列表加载慢 | stallRounds + maxScrolls 保护 |
| 虚拟列表 DOM 变化 | 保存 uid 列表而非 DOM 元素 |

## 后续扩展

1. 支持多个分组监控（好友圈、自定义分组）
2. 支持关键词过滤（只监控包含特定关键词的新帖）
3. 支持多账号监控
4. 支持通知推送（webhook/mailbox）

---

创建时间: 2026-04-07
状态: 设计完成，待实现
