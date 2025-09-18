# 微博容器化操作系统架构设计

## 总体架构概念

基于您的要求，我们设计了一个基于容器ID和内容列表的嵌套元素-操作绑定架构。这个架构将微博页面视为一组分层容器的集合，每个容器都有：

1. **唯一ID和描述** - 用于识别和定位
2. **CSS选择器列表** - 用于DOM元素查找
3. **内容列表** - 包含子容器的数组
4. **操作列表** - 该容器支持的操作
5. **继承关系** - 父子容器间的操作继承

## 核心组件

### 1. ContainerElement（容器元素）
```javascript
{
    id: 'unique-container-id',
    name: '容器名称',
    description: '容器描述',
    type: 'container-type',
    selectors: ['css-selector-1', 'css-selector-2'],
    contentList: [childContainer1, childContainer2],
    operations: { operationName: operationDefinition },
    metadata: {}
}
```

### 2. OperationDefinition（操作定义）
```javascript
{
    name: 'operation-name',
    description: '操作描述',
    action: async (context, params) => { /* 操作逻辑 */ },
    parameters: {},
    timeout: 30000
}
```

### 3. WebContainerLibrary（容器库）
- 管理所有容器实例
- 提供容器查找和检索功能
- 支持按类型、ID查找容器

### 4. PreciseWebOperator（精确网页操作器）
- 执行容器操作
- 管理操作历史
- 提供错误处理和重试机制

## 微博页面完整架构

### 第一层：页面总容器（Page Container）
**ID**: `weibo-page-container`
**类型**: `page-container`
**描述**: 微博页面的最外层容器
**选择器**: `body`, `.woo-layout-main`
**操作**:
- `getPageInfo`: 获取页面基本信息
- `navigateTo`: 导航到指定URL
- `checkLoginState`: 检查登录状态
- `scrollTo`: 滚动到指定位置

**内容列表**:
- `navigation-container`: 导航栏容器
- `main-content-container`: 主内容容器
- `sidebar-container`: 侧边栏容器

### 第二层：主要区域容器

#### 2.1 导航栏容器
**ID**: `navigation-container`
**类型**: `navigation-container`
**描述**: 页面顶部导航栏
**选择器**: `.woo-bar-nav`, `.gn_header`
**操作**:
- `getSearchBox`: 获取搜索框
- `getNotifications`: 获取通知
- `getUserMenu`: 获取用户菜单
- `clickHome`: 点击首页
- `clickSearch`: 点击搜索

#### 2.2 主内容容器
**ID**: `main-content-container`
**类型**: `main-content-container`
**描述**: 页面主内容区域
**选择器**: `.woo-layout-main`, `.main-content`
**操作**:
- `getContent`: 获取主内容
- `getCurrentPageType`: 获取当前页面类型
- `scrollToContent`: 滚动到内容区域

**内容列表**:
- `feed-container`: 信息流容器
- `post-detail-container`: 帖子详情容器
- `user-profile-container`: 用户主页容器
- `search-results-container`: 搜索结果容器

### 第三层：功能容器

#### 3.1 信息流容器
**ID**: `feed-container`
**类型**: `feed-container`
**描述**: 微博信息流（首页、关注页等）
**选择器**: `.Feed_body_3R0rO`, `.woo-feed-list`
**操作**:
- `loadMorePosts`: 加载更多帖子
- `scrollToBottom`: 滚动到底部
- `getAllPosts`: 获取所有帖子
- `filterByType`: 按类型筛选

**内容列表**:
- `post-item-container`: 帖子项容器

#### 3.2 帖子详情容器
**ID**: `post-detail-container`
**类型**: `post-detail-container`
**描述**: 单个微博帖子的详情页
**选择器**: `article[class*="Feed_wrap_3v9LH"]`, `.woo-panel-main.Detail_feed_3iffy`
**操作**:
- `getPostInfo`: 获取帖子信息
- `likePost`: 点赞帖子
- `repostPost`: 转发帖子
- `commentPost`: 评论帖子
- `followAuthor`: 关注作者

**内容列表**:
- `post-media-container`: 媒体内容容器
- `post-text-container`: 文字内容容器
- `post-stats-container`: 统计信息容器
- `comments-container`: 评论区容器

#### 3.3 用户主页容器
**ID**: `user-profile-container`
**类型**: `user-profile-container`
**描述**: 用户个人主页
**选择器**: `.Profile_wrap_2y_pF`, `.woo-panel.Profile_panel_3y_pF`
**操作**:
- `getUserInfo`: 获取用户信息
- `getFollowStats`: 获取关注统计
- `followUser`: 关注用户
- `sendMessage`: 发送消息
- `getUserPosts`: 获取用户帖子

**内容列表**:
- `user-header-container`: 用户头部信息容器
- `user-tabs-container`: 用户标签页容器
- `user-feed-container`: 用户动态容器

#### 3.4 搜索结果容器
**ID**: `search-results-container`
**类型**: `search-results-container`
**描述**: 搜索结果页面
**选择器**: `.search-result`, `.woo-panel.SearchResult`
**操作**:
- `getSearchResults`: 获取搜索结果
- `filterResults`: 筛选结果
- `loadMoreResults`: 加载更多结果
- `changeSearchType`: 切换搜索类型

### 第四层：内容容器

#### 4.1 媒体内容容器
**ID**: `post-media-container`
**类型**: `media-container`
**描述**: 帖子的媒体内容（图片、视频）
**选择器**: `.woo-box-flex.media_media-pic_2hjWt`, `.media_media-video_2hjWt`
**操作**:
- `extractImages`: 提取图片
- `extractVideos`: 提取视频
- `downloadMedia`: 下载媒体
- `getMediaInfo`: 获取媒体信息

**内容列表**:
- `image-container`: 图片容器
- `video-container`: 视频容器

#### 4.2 文字内容容器
**ID**: `post-text-container`
**类型**: `text-container`
**描述**: 帖子的文字内容
**选择器**: `.detail_wbtext_4CRf9`, `.Feed_body_3R0rO .detail_wbtext_4CRf9`
**操作**:
- `extractText`: 提取文字内容
- `getHashtags`: 提取话题标签
- `getMentions`: 提取@提及
- `getEmojis`: 提取表情

#### 4.3 统计信息容器
**ID**: `post-stats-container`
**类型**: `stats-container`
**描述**: 帖子的统计信息（点赞、转发、评论）
**选择器**: `.woo-box-flex.woo-box-alignCenter.woo-box-justifyCenter.feed_action_3fFqM`
**操作**:
- `getStats`: 获取统计信息
- `clickLike`: 点击点赞
- `clickComment`: 点击评论
- `clickRepost`: 点击转发

#### 4.4 评论区容器
**ID**: `comments-container`
**类型**: `comments-container`
**描述**: 帖子的评论区
**选择器**: `.Detail_box_3Jeom`, `.woo-panel-main.Card_wrap_2ibWe.Detail_detail_3typT`
**操作**:
- `scrollToView`: 滚动到评论区
- `checkHasComments`: 检查是否有评论
- `extractAllComments`: 提取所有评论
- `postComment`: 发表评论
- `loadMoreComments`: 加载更多评论

**内容列表**:
- `comment-list-container`: 评论列表容器
- `comment-input-container`: 评论输入容器

### 第五层：子功能容器

#### 5.1 评论列表容器
**ID**: `comment-list-container`
**类型**: `comment-list-container`
**描述**: 评论列表
**选择器**: `.RepostCommentList_mar1_3VHkS`, `.Scroll_container_280Ky`
**操作**:
- `getAllCommentItems`: 获取所有评论项
- `scrollToComment`: 滚动到指定评论
- `filterComments`: 筛选评论

#### 5.2 评论项容器
**ID**: `comment-item-container`
**类型**: `comment-item-container`
**描述**: 单个评论项
**选择器**: `.wbpro-scroller-item`, `.vue-recycle-scroller__item-view`
**操作**:
- `expandComment`: 展开评论
- `extractCommentData`: 提取评论数据
- `likeComment`: 点赞评论
- `replyComment`: 回复评论

#### 5.3 图片容器
**ID**: `image-container`
**类型**: `image-container`
**描述**: 单个图片
**选择器**: `.woo-box-flex.woo-box-alignCenter.media_media-pic_2hjWt img`
**操作**:
- `getImageInfo`: 获取图片信息
- `downloadImage`: 下载图片
- `viewImage`: 查看大图

#### 5.4 视频容器
**ID**: `video-container`
**类型**: `video-container`
**描述**: 单个视频
**选择器**: `.woo-box-flex.woo-box-alignCenter.media_media-video_2hjWt video`
**操作**:
- `getVideoInfo`: 获取视频信息
- `playVideo`: 播放视频
- `downloadVideo`: 下载视频

## 操作流程示例

### 1. 提取微博帖子所有内容
```javascript
// 1. 获取页面容器
const pageContainer = operator.getContainer('weibo-page-container');

// 2. 获取主内容容器
const mainContent = pageContainer.getContentById('main-content-container');

// 3. 获取帖子详情容器
const postDetail = mainContent.getContentById('post-detail-container');

// 4. 获取媒体内容
const mediaContainer = postDetail.getContentById('post-media-container');
const images = await mediaContainer.executeOperation('extractImages');
const videos = await mediaContainer.executeOperation('extractVideos');

// 5. 获取文字内容
const textContainer = postDetail.getContentById('post-text-container');
const text = await textContainer.executeOperation('extractText');

// 6. 获取评论
const commentsContainer = postDetail.getContentById('comments-container');
const comments = await commentsContainer.executeOperation('extractAllComments');
```

### 2. 用户主页操作
```javascript
// 1. 获取用户主页容器
const userProfile = operator.getContainer('user-profile-container');

// 2. 获取用户信息
const userInfo = await userProfile.executeOperation('getUserInfo');

// 3. 获取用户帖子
const userFeed = userProfile.getContentById('user-feed-container');
const posts = await userFeed.executeOperation('getAllPosts');

// 4. 关注用户
await userProfile.executeOperation('followUser');
```

## 优势特点

1. **模块化设计** - 每个容器都是独立的模块
2. **继承关系** - 子容器继承父容器的操作
3. **可扩展性** - 可以轻松添加新的容器和操作
4. **可维护性** - 代码结构清晰，易于维护
5. **可重用性** - 容器和操作可以在不同页面重用
6. **精确控制** - 每个操作都有明确的目标和范围

## 应用场景

1. **数据抓取** - 提取帖子、评论、用户信息
2. **自动化操作** - 点赞、评论、关注、转发
3. **内容分析** - 分析帖子内容、用户行为
4. **监控和预警** - 监控特定用户或话题
5. **批量处理** - 批量下载图片、视频

这个架构提供了一个完整的微博页面操作解决方案，可以精确地控制每个元素和操作，实现高效的网页自动化。