// 新浪微博主页容器结构设计
// 基于实际页面结构的精确容器映射

import { BaseContainer } from '../../containers/base-container';
import { SystemStateCenter } from '../../core/system-state-center';
import { IExecutionContext } from '../../interfaces/core';
import { WeiboPageType, WeiboPageContext, WeiboSelectors } from './weibo-page-types';
import { WeiboPost, WeiboUser } from './weibo-data-models';

// 微博主页容器
export class WeiboHomepageContainer extends BaseContainer {
  private pageContext: WeiboPageContext;
  private selectors = WeiboSelectors[WeiboPageType.HOMEPAGE];
  
  constructor(stateCenter: SystemStateCenter, pageContext: WeiboPageContext) {
    super(stateCenter, {
      id: 'weibo_homepage',
      name: 'Weibo Homepage Container',
      version: '1.0.0',
      type: 'weibo-homepage-container'
    });
    
    this.pageContext = pageContext;
  }

  async initialize(context: IExecutionContext): Promise<void> {
    await super.initialize(context);
    
    // 验证页面类型
    if (this.pageContext.pageType !== WeiboPageType.HOMEPAGE) {
      throw new Error(`Invalid page type: ${this.pageContext.pageType}. Expected: ${WeiboPageType.HOMEPAGE}`);
    }
    
    // 执行内部遍历，发现子容器
    await this.discoverSubContainers(context);
    
    this.logInfo('Weibo homepage container initialized', {
      url: this.pageContext.url,
      title: this.pageContext.title
    });
  }

  protected async discoverSubContainers(context: IExecutionContext): Promise<void> {
    // 发现导航栏容器
    await this.discoverNavigationContainer(context);
    
    // 发现Feed流容器
    await this.discoverFeedContainer(context);
    
    // 发现侧边栏容器
    await this.discoverSidebarContainer(context);
    
    // 发现发布框容器
    await this.discoverPostBoxContainer(context);
  }

  private async discoverNavigationContainer(context: IExecutionContext): Promise<void> {
    const navigationContainer = new WeiboNavigationContainer(
      this.stateCenter,
      this.pageContext
    );
    
    await navigationContainer.initialize(context);
    
    // 注册子容器
    await this.registerSubContainer('navigation', navigationContainer);
  }

  private async discoverFeedContainer(context: IExecutionContext): Promise<void> {
    const feedContainer = new WeiboFeedContainer(
      this.stateCenter,
      this.pageContext
    );
    
    await feedContainer.initialize(context);
    
    // 注册子容器
    await this.registerSubContainer('feed', feedContainer);
  }

  private async discoverSidebarContainer(context: IExecutionContext): Promise<void> {
    const sidebarContainer = new WeiboSidebarContainer(
      this.stateCenter,
      this.pageContext
    );
    
    await sidebarContainer.initialize(context);
    
    // 注册子容器
    await this.registerSubContainer('sidebar', sidebarContainer);
  }

  private async discoverPostBoxContainer(context: IExecutionContext): Promise<void> {
    const postBoxContainer = new WeiboPostBoxContainer(
      this.stateCenter,
      this.pageContext
    );
    
    await postBoxContainer.initialize(context);
    
    // 注册子容器
    await this.registerSubContainer('postBox', postBoxContainer);
  }

  // 获取页面上下文
  getPageContext(): WeiboPageContext {
    return this.pageContext;
  }

  // 获取导航栏容器
  getNavigation(): WeiboNavigationContainer {
    return this.getSubContainer('navigation') as WeiboNavigationContainer;
  }

  // 获取Feed流容器
  getFeed(): WeiboFeedContainer {
    return this.getSubContainer('feed') as WeiboFeedContainer;
  }

  // 获取侧边栏容器
  getSidebar(): WeiboSidebarContainer {
    return this.getSubContainer('sidebar') as WeiboSidebarContainer;
  }

  // 获取发布框容器
  getPostBox(): WeiboPostBoxContainer {
    return this.getSubContainer('postBox') as WeiboPostBoxContainer;
  }

  // 检查登录状态
  async checkLoginStatus(context: IExecutionContext): Promise<boolean> {
    try {
      const loginButton = await context.page?.$('a[href*="login"]');
      if (loginButton) {
        return false;
      }
      
      // 检查用户信息元素
      const userInfo = await context.page?.$('div[class*="userinfo"]');
      return !!userInfo;
    } catch (error) {
      this.warn('Failed to check login status', { error: (error as Error).message });
      return false;
    }
  }

  // 获取当前用户信息
  async getCurrentUser(context: IExecutionContext): Promise<WeiboUser | null> {
    try {
      const userElement = await context.page?.$('div[class*="userinfo"]');
      if (!userElement) {
        return null;
      }

      const userText = await userElement.textContent();
      const avatarElement = await userElement.$('img');
      const avatar = await avatarElement?.getAttribute('src') || '';

      return {
        userId: '',
        username: userText?.trim() || '',
        nickname: userText?.trim() || '',
        avatar,
        verified: false,
        verifiedType: 'personal',
        description: '',
        location: '',
        gender: 'unknown',
        followCount: 0,
        fansCount: 0,
        postCount: 0,
        level: 0,
        tags: [],
        isProtected: false,
        isFollowing: false,
        isFollowed: false
      };
    } catch (error) {
      this.warn('Failed to get current user info', { error: (error as Error).message });
      return null;
    }
  }
}

// 导航栏容器
export class WeiboNavigationContainer extends BaseContainer {
  private pageContext: WeiboPageContext;
  private selectors = WeiboSelectors[WeiboPageType.HOMEPAGE].navigation;

  constructor(stateCenter: SystemStateCenter, pageContext: WeiboPageContext) {
    super(stateCenter, {
      id: 'weibo_navigation',
      name: 'Weibo Navigation Container',
      version: '1.0.0',
      type: 'weibo-navigation-container'
    });
    
    this.pageContext = pageContext;
  }

  async initialize(context: IExecutionContext): Promise<void> {
    await super.initialize(context);
    
    // 验证导航栏元素存在
    const navElement = await context.page?.$(this.selectors.home);
    if (!navElement) {
      throw new Error('Navigation elements not found');
    }
    
    this.logInfo('Weibo navigation container initialized');
  }

  // 导航到首页
  async navigateToHome(context: IExecutionContext): Promise<void> {
    await this.clickElement(context, this.selectors.home);
  }

  // 导航到发现页
  async navigateToDiscover(context: IExecutionContext): Promise<void> {
    await this.clickElement(context, this.selectors.discover);
  }

  // 导航到消息页
  async navigateToMessage(context: IExecutionContext): Promise<void> {
    await this.clickElement(context, this.selectors.message);
  }

  // 导航到个人主页
  async navigateToProfile(context: IExecutionContext): Promise<void> {
    await this.clickElement(context, this.selectors.profile);
  }

  // 获取当前活跃的导航项
  async getActiveNavItem(context: IExecutionContext): Promise<string | null> {
    try {
      const activeElement = await context.page?.$('a[class*="active"]');
      if (!activeElement) {
        return null;
      }
      
      const gn = await activeElement.getAttribute('gn');
      return gn;
    } catch (error) {
      this.warn('Failed to get active nav item', { error: (error as Error).message });
      return null;
    }
  }

  private async clickElement(context: IExecutionContext, selector: string): Promise<void> {
    try {
      const element = await context.page?.$(selector);
      if (!element) {
        throw new Error(`Navigation element not found: ${selector}`);
      }
      
      await element.click();
      await this.delay(1000); // 等待页面响应
    } catch (error) {
      throw new Error(`Failed to click navigation element: ${selector}`);
    }
  }
}

// Feed流容器
export class WeiboFeedContainer extends BaseContainer {
  private pageContext: WeiboPageContext;
  private selectors = WeiboSelectors[WeiboPageType.HOMEPAGE];
  private postContainers: Map<string, WeiboPostContainer> = new Map();

  constructor(stateCenter: SystemStateCenter, pageContext: WeiboPageContext) {
    super(stateCenter, {
      id: 'weibo_feed',
      name: 'Weibo Feed Container',
      version: '1.0.0',
      type: 'weibo-feed-container'
    });
    
    this.pageContext = pageContext;
  }

  async initialize(context: IExecutionContext): Promise<void> {
    await super.initialize(context);
    
    // 验证Feed流元素存在
    const feedElement = await context.page?.$(this.selectors.feedList);
    if (!feedElement) {
      throw new Error('Feed list element not found');
    }
    
    // 发现微博帖子容器
    await this.discoverPostContainers(context);
    
    this.logInfo('Weibo feed container initialized');
  }

  protected async discoverPostContainers(context: IExecutionContext): Promise<void> {
    const postElements = await context.page?.$$(this.selectors.postItem);
    
    if (!postElements || postElements.length === 0) {
      this.warn('No post elements found in feed');
      return;
    }

    for (let i = 0; i < postElements.length; i++) {
      const postElement = postElements[i];
      const postId = `post_${i}_${Date.now()}`;
      
      const postContainer = new WeiboPostContainer(
        this.stateCenter,
        this.pageContext,
        postId,
        i
      );
      
      await postContainer.initialize(context);
      
      // 注册子容器
      await this.registerSubContainer(postId, postContainer);
      this.postContainers.set(postId, postContainer);
    }
    
    this.logInfo(`Discovered ${postElements.length} post containers`);
  }

  // 获取所有帖子容器
  getPostContainers(): WeiboPostContainer[] {
    return Array.from(this.postContainers.values());
  }

  // 获取指定索引的帖子容器
  getPostContainer(index: number): WeiboPostContainer | null {
    const containers = Array.from(this.postContainers.values());
    return containers[index] || null;
  }

  // 获取帖子数量
  getPostCount(): number {
    return this.postContainers.size;
  }

  // 刷新Feed流
  async refreshFeed(context: IExecutionContext): Promise<void> {
    try {
      // 查找刷新按钮
      const refreshButton = await context.page?.$('button[class*="refresh"]');
      if (refreshButton) {
        await refreshButton.click();
        await this.delay(2000);
        
        // 重新发现帖子容器
        await this.discoverPostContainers(context);
      }
    } catch (error) {
      this.warn('Failed to refresh feed', { error: (error as Error).message });
    }
  }

  // 加载更多帖子
  async loadMorePosts(context: IExecutionContext): Promise<boolean> {
    try {
      // 滚动到底部
      await context.page?.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      await this.delay(2000);
      
      // 检查是否有新的帖子
      const newPostElements = await context.page?.$$(this.selectors.postItem);
      const oldCount = this.postContainers.size;
      
      if (newPostElements && newPostElements.length > oldCount) {
        await this.discoverPostContainers(context);
        return true;
      }
      
      return false;
    } catch (error) {
      this.warn('Failed to load more posts', { error: (error as Error).message });
      return false;
    }
  }
}

// 单个微博帖子容器
export class WeiboPostContainer extends BaseContainer {
  private pageContext: WeiboPageContext;
  private postId: string;
  private postIndex: number;
  private selectors = WeiboSelectors[WeiboPageType.HOMEPAGE];

  constructor(
    stateCenter: SystemStateCenter, 
    pageContext: WeiboPageContext, 
    postId: string,
    postIndex: number
  ) {
    super(stateCenter, {
      id: postId,
      name: `Weibo Post Container ${postIndex}`,
      version: '1.0.0',
      type: 'weibo-post-container'
    });
    
    this.pageContext = pageContext;
    this.postId = postId;
    this.postIndex = postIndex;
  }

  async initialize(context: IExecutionContext): Promise<void> {
    await super.initialize(context);
    
    // 验证帖子元素存在
    const postElement = await this.getPostElement(context);
    if (!postElement) {
      throw new Error(`Post element not found for index ${this.postIndex}`);
    }
    
    this.logInfo(`Weibo post container initialized: ${this.postId}`);
  }

  // 获取帖子元素
  private async getPostElement(context: IExecutionContext): Promise<any> {
    const postElements = await context.page?.$$(this.selectors.postItem);
    return postElements?.[this.postIndex] || null;
  }

  // 获取帖子内容
  async getPostContent(context: IExecutionContext): Promise<WeiboPost | null> {
    try {
      const postElement = await this.getPostElement(context);
      if (!postElement) {
        return null;
      }

      const contentElement = await postElement.$(this.selectors.postContent);
      const content = await contentElement?.textContent() || '';
      
      // 提取用户信息
      const userElement = await postElement.$('a[class*="username"]');
      const username = await userElement?.textContent() || '';
      
      // 提取发布时间
      const timeElement = await postElement.$('a[class*="time"]');
      const publishTime = await timeElement?.textContent() || '';

      return {
        mid: this.postId,
        uid: '',
        username,
        nickname: username,
        avatar: '',
        content: content.trim(),
        rawContent: content,
        publishTime: new Date(),
        source: '',
        images: [],
        videos: [],
        repostCount: 0,
        commentCount: 0,
        likeCount: 0,
        isLiked: false,
        isReposted: false,
        isCommented: false,
        isPrivate: false,
        isTop: false,
        isOriginal: true,
        topics: [],
        mentions: [],
        urls: [],
        attitudes: [],
        permissions: {
          canComment: true,
          canRepost: true,
          canLike: true
        }
      };
    } catch (error) {
      this.warn('Failed to get post content', { error: (error as Error).message });
      return null;
    }
  }

  // 点赞帖子
  async likePost(context: IExecutionContext): Promise<boolean> {
    try {
      const postElement = await this.getPostElement(context);
      if (!postElement) {
        return false;
      }

      const likeButton = await postElement.$(this.selectors.likeButton);
      if (!likeButton) {
        return false;
      }

      await likeButton.click();
      await this.delay(1000);
      
      return true;
    } catch (error) {
      this.warn('Failed to like post', { error: (error as Error).message });
      return false;
    }
  }

  // 评论帖子
  async commentPost(context: IExecutionContext, comment: string): Promise<boolean> {
    try {
      const postElement = await this.getPostElement(context);
      if (!postElement) {
        return false;
      }

      const commentButton = await postElement.$(this.selectors.commentButton);
      if (!commentButton) {
        return false;
      }

      await commentButton.click();
      await this.delay(1000);
      
      // 输入评论内容
      const commentInput = await context.page?.$('textarea[class*="comment"]');
      if (commentInput) {
        await commentInput.type(comment);
        
        // 提交评论
        const submitButton = await context.page?.$('button[class*="submit"]');
        if (submitButton) {
          await submitButton.click();
          await this.delay(1000);
        }
      }
      
      return true;
    } catch (error) {
      this.warn('Failed to comment post', { error: (error as Error).message });
      return false;
    }
  }

  // 转发帖子
  async repostPost(context: IExecutionContext, repostContent: string = ''): Promise<boolean> {
    try {
      const postElement = await this.getPostElement(context);
      if (!postElement) {
        return false;
      }

      const repostButton = await postElement.$(this.selectors.repostButton);
      if (!repostButton) {
        return false;
      }

      await repostButton.click();
      await this.delay(1000);
      
      // 输入转发内容
      if (repostContent) {
        const repostInput = await context.page?.$('textarea[class*="repost"]');
        if (repostInput) {
          await repostInput.type(repostContent);
        }
      }
      
      // 提交转发
      const submitButton = await context.page?.$('button[class*="submit"]');
      if (submitButton) {
        await submitButton.click();
        await this.delay(1000);
      }
      
      return true;
    } catch (error) {
      this.warn('Failed to repost post', { error: (error as Error).message });
      return false;
    }
  }
}

// 侧边栏容器
export class WeiboSidebarContainer extends BaseContainer {
  private pageContext: WeiboPageContext;

  constructor(stateCenter: SystemStateCenter, pageContext: WeiboPageContext) {
    super(stateCenter, {
      id: 'weibo_sidebar',
      name: 'Weibo Sidebar Container',
      version: '1.0.0',
      type: 'weibo-sidebar-container'
    });
    
    this.pageContext = pageContext;
  }

  async initialize(context: IExecutionContext): Promise<void> {
    await super.initialize(context);
    
    // 验证侧边栏元素存在
    const sidebarElement = await context.page?.$('div[class*="sidebar"]');
    if (!sidebarElement) {
      throw new Error('Sidebar element not found');
    }
    
    this.logInfo('Weibo sidebar container initialized');
  }

  // 获取热搜列表
  async getHotSearchList(context: IExecutionContext): Promise<any[]> {
    try {
      const hotSearchElements = await context.page?.$$('div[class*="hot_search_item"]');
      
      if (!hotSearchElements || hotSearchElements.length === 0) {
        return [];
      }

      const hotSearchList = [];
      for (const element of hotSearchElements) {
        const titleElement = await element.$('a');
        const title = await titleElement?.textContent() || '';
        const url = await titleElement?.getAttribute('href') || '';
        
        hotSearchList.push({
          title: title.trim(),
          url,
          rank: hotSearchList.length + 1
        });
      }
      
      return hotSearchList;
    } catch (error) {
      this.warn('Failed to get hot search list', { error: (error as Error).message });
      return [];
    }
  }

  // 获取推荐用户
  async getRecommendedUsers(context: IExecutionContext): Promise<any[]> {
    try {
      const userElements = await context.page?.$$('div[class*="recommended_user"]');
      
      if (!userElements || userElements.length === 0) {
        return [];
      }

      const users = [];
      for (const element of userElements) {
        const nameElement = await element.$('a[class*="username"]');
        const name = await nameElement?.textContent() || '';
        
        users.push({
          username: name.trim(),
          followButton: await element.$('button[class*="follow"]')
        });
      }
      
      return users;
    } catch (error) {
      this.warn('Failed to get recommended users', { error: (error as Error).message });
      return [];
    }
  }
}

// 发布框容器
export class WeiboPostBoxContainer extends BaseContainer {
  private pageContext: WeiboPageContext;

  constructor(stateCenter: SystemStateCenter, pageContext: WeiboPageContext) {
    super(stateCenter, {
      id: 'weibo_postbox',
      name: 'Weibo Post Box Container',
      version: '1.0.0',
      type: 'weibo-postbox-container'
    });
    
    this.pageContext = pageContext;
  }

  async initialize(context: IExecutionContext): Promise<void> {
    await super.initialize(context);
    
    // 验证发布框元素存在
    const postBoxElement = await context.page?.$('div[class*="postbox"]');
    if (!postBoxElement) {
      this.warn('Post box element not found - user may not be logged in');
      return;
    }
    
    this.logInfo('Weibo post box container initialized');
  }

  // 检查是否可以发布微博
  async canPost(context: IExecutionContext): Promise<boolean> {
    try {
      const postBoxElement = await context.page?.$('div[class*="postbox"]');
      return !!postBoxElement;
    } catch (error) {
      return false;
    }
  }

  // 发布微博
  async publishPost(context: IExecutionContext, content: string): Promise<boolean> {
    try {
      const postBoxElement = await context.page?.$('div[class*="postbox"]');
      if (!postBoxElement) {
        throw new Error('Post box not found');
      }

      // 点击发布框
      await postBoxElement.click();
      await this.delay(1000);

      // 输入内容
      const textarea = await context.page?.$('textarea[class*="post_content"]');
      if (!textarea) {
        throw new Error('Post content textarea not found');
      }

      await textarea.type(content);

      // 发布
      const submitButton = await context.page?.$('button[class*="submit"]');
      if (!submitButton) {
        throw new Error('Submit button not found');
      }

      await submitButton.click();
      await this.delay(2000);

      return true;
    } catch (error) {
      this.warn('Failed to publish post', { error: (error as Error).message });
      return false;
    }
  }

  // 上传图片
  async uploadImage(context: IExecutionContext, imagePath: string): Promise<boolean> {
    try {
      const postBoxElement = await context.page?.$('div[class*="postbox"]');
      if (!postBoxElement) {
        return false;
      }

      // 点击图片上传按钮
      const imageButton = await postBoxElement.$('button[class*="image"]');
      if (!imageButton) {
        return false;
      }

      await imageButton.click();
      await this.delay(1000);

      // 这里需要处理文件上传
      // 实际实现需要根据具体的文件上传机制来处理
      
      return true;
    } catch (error) {
      this.warn('Failed to upload image', { error: (error as Error).message });
      return false;
    }
  }
}