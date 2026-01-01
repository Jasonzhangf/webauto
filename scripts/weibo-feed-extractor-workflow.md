# 微博 Feed 提取器 - Workflow 构建方案

## 目标
访问微博主页，遍历所有帖子，提取帖子链接和摘要信息。

## 容器结构分析

### 已有容器
- `weibo_main_page`: 微博主页面
  - `weibo_main_page.feed_list`: Feed 列表容器
    - `weibo_main_page.feed_post`: 单条帖子容器

### 容器能力
```json
{
  "weibo_main_page": ["scroll", "highlight", "find-child"],
  "weibo_main_page.feed_list": ["scroll", "highlight", "find-child"],
  "weibo_main_page.feed_post": ["highlight", "extract", "find-child"]
}
```

## Workflow 执行步骤

### Step 1: 初始化
- 访问微博主页 (`https://weibo.com`)
- 等待页面加载完成
- 验证 `weibo_main_page` 容器匹配成功

### Step 2: 定位 Feed 列表
- 查找 `weibo_main_page.feed_list` 容器
- 高亮 Feed 列表容器（黄色实线框）
- 记录已匹配的帖子数量

### Step 3: 遍历帖子

**3.1 提取第一个帖子**
- 在 `weibo_main_page.feed_list` 中执行 `find-child` 操作，目标是 `weibo_main_page.feed_post`
- 高亮匹配到的帖子（蓝色实线框）

**3.2 提取帖子信息**
- 对匹配到的帖子执行 `extract` 操作：
  - 提取链接: `a[href*='weibo.com']` 元素
  - 提取作者: `header a[href*='weibo.com']` 元素
  - 提取内容摘要: `div[class*='detail_wbtext']` 元素
  - 提取时间: `time` 元素
  高亮提取的字段（绿色实线框）

**3.3 记录数据**
- 将提取的数据存储到内存结构中

### Step 4: 提取下一个帖子**
- 对 `weibo_main_page.feed_list` 执行 `find-child` 操作，找到下一个 `weibo_main_page.feed_post`
- 重复 3.2 和 3.3 步

### Step 5: 提取所有可见帖子**
- 重复步骤 4，直到：
  - 找不到新的帖子
  - 或达到最大数量限制（如 50 条）

### Step 6: 滚动加载更多帖子
- 对 `weibo_main_page` 容器执行 `scroll` 操作，方向向下，距离 640px
- 等待新内容加载
- 等待 2 秒 settle 时间

### Step 7: 继续遍历
- 返回步骤 3，继续提取新加载的帖子
- 重复步骤 3-6，直到：
  - 滚动后没有发现新帖子（连续 3 次滚动）
  - 或达到总数量限制（如 100 条）

## 需要的 Operations

### 已有操作
- `highlight`: 高亮元素
- `scroll`: 滚动页面
- `find-child`: 查找子容器

### 新增操作

#### extract 操作
**作用**: 从容器中提取结构化数据

**配置项**:
```json
{
  "target": "links | summary | author | timestamp",
  "selector": "css 选择器",
  "include_text": true,
  "max_items": 32
}
```

**示例**:
```json
{
  "type": "extract",
  "config": {
    "target": "links",
    "selector": "a[href*='weibo.com']",
    "include_text": false,
    "max_items": 32
  }
}
```

**实现要点**:
1. 在容器内查找所有匹配的 selector
2. 提取以下信息：
   - 链接: href 属性
   - 文本: textContent
   - 截取长度限制在 200 字符
3. 返回数组格式

#### mouse-move 操作
**作用**: 移动鼠标到指定位置（用于滚动和点击准备）

**配置项**:
```json
{
  "x": 0,
  "y": 0,
  "steps": 1
}
```

**实现要点**:
- 支持 step-wise 移动
- 用于在滚动前将鼠标移到安全位置

## 进度反馈机制

### 高亮层级
1. 容器层级（黄色）
   - `weibo_main_page`: 主容器
   - `weibo_feed_list`: Feed 列表容器

2. 帖子层级（蓝色）
   - `weibo_main_page.feed_post`: 帖子容器

3. 提取层级（绿色）
   - 提取的链接、作者、时间

### WebSocket 事件
- `workflow:started`: 工作流开始
- `workflow:progress`: 步骤进度更新
  ```json
  {
    "step": "初始化 | 定位Feed | 提取帖子 | 滚动 | 完成",
    "progress": 0-100,
    "message": "正在执行..."
  }
  ```
- `workflow:extracted`: 提取完成
  ```json
  {
    "containerId": "weibo_main_page.feed_post",
    "data": {
      "links": [],
      "author": "",
      "timestamp": "",
      "summary": ""
    }
  }
  ```

## 错误处理和重试

### 容器匹配失败
- 重试 3 次，间隔 2 秒
- 失败后发送 `workflow:error` 事件

### 滚动无新内容
- 连续 3 次滚动无新帖子
- 发送 `workflow:warning` 事件

### 提取失败
- 跳过当前帖子，记录到错误日志
- 继续下一个帖子

## 测试计划

### 单元测试
1. 测试 `extract` 操作提取链接
2. 测试 `find-child` 操作连续查找
3. 测试 `scroll` 操作的滚动距离

### 集成测试
1. 完整流程：初始化 -> 提取 10 条帖子 -> 滚动 -> 提取 10 条
2. 边界测试：
   - 页面无网络连接
   - 容器定义加载失败
   - 滚动到页面底部
