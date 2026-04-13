# Weibo Special Follow Monitor Design

## 功能概述

监控微博"特别关注"分组用户的新帖动态，自动发现并汇报新发布的内容。

## 核心流程

### 1. 动态发现分组路径

```
用户手动导航到关注列表页
  → 脚本检测"特别关注" H3 标题
  → 向上遍历父元素找到用户链接容器
  → 提取用户 UID 列表
```

**风控规则**：
- ❌ 禁止脚本试探寻找元素
- ✅ 用户手动用 camo 导航到目标页面
- ✅ 脚本只负责数据提取（devtools eval）

### 2. URL 模式

- 关注列表页：`/u/page/follow/{用户UID}`
- 特别关注分组：左侧导航 H3 "特别关注" 区域

### 3. 用户列表提取

从 H3 区域向上遍历最多 5 层父元素，找到包含 `a[href*="/u/"]` 的容器，提取所有用户 UID。

### 4. 新帖检测

对每个用户：
1. 用 camo goto 访问用户主页 `/u/{UID}`
2. 用 devtools eval 提取第一条微博的 weiboId
3. 对比 post-state.json 中的上次记录
4. 发现新 weiboId → 记录到 new-posts.jsonl

## CLI 命令

```bash
# 同步用户列表（需要先手动导航到关注页）
node apps/webauto/entry/weibo-special-follow.mjs sync --profile xhs-qa-1

# 巡检新帖（单次执行）
node apps/webauto/entry/weibo-special-follow.mjs inspect --profile xhs-qa-1

# 持续监控（定时巡检）
node apps/webauto/entry/weibo-special-follow.mjs start --profile xhs-qa-1 --interval 600000

# 查看状态
node apps/webauto/entry/weibo-special-follow.mjs status --profile xhs-qa-1
```

## 数据结构

### users.json

```json
{
  "users": [
    { "uid": "2169039837", "name": "karminski-牙医", "lastWeiboId": null }
  ],
  "updatedAt": "2026-04-08T13:11:59.087Z",
  "total": 6
}
```

### post-state.json

```json
{
  "states": {
    "2169039837": "QziBc5xN0"
  },
  "updatedAt": "2026-04-08T13:13:53.630Z"
}
```

### new-posts.jsonl

```jsonl
{"uid":"2169039837","weiboId":"QziBc5xN0","content":"...","timestamp":"...","url":"..."}
```

## 文件结构

```
apps/webauto/entry/
  weibo-special-follow.mjs                  # CLI 入口
  lib/weibo-special-follow-monitor-runner.mjs # Runner

modules/camo-runtime/src/autoscript/action-providers/weibo/
  discover-special-follow.mjs               # 分组发现
  extract-user-list.mjs                     # 用户列表提取
  detect-new-posts.mjs                      # 新帖检测
  new-post-detect.mjs                       # 单用户检测
  selectors.mjs                             # 选择器常量
```

## 风控硬规则

1. **禁止脚本试探**：不能用自动化脚本频繁试探寻找元素
2. **手动导航**：用户必须用 camo 手动导航到目标页面
3. **只提取数据**：脚本只能用 devtools eval 提取数据，不做 click/goto
4. **等待间隔**：每个用户之间延迟 5 秒

## 已知问题

### 转义问题

模板字符串中的正则表达式 `/\/u\/(\d+)/` 需要正确转义。

**解决方案**：使用 `JSON.stringify()` 生成脚本字符串。

### 缺失用户

某些用户可能：
- 主页无 article 元素（隐私设置）
- 只有转发帖，无原创内容

这是正常业务场景，不影响功能。
