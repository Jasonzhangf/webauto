// 新浪微博主页具体操作实现
// 基于页面容器的精确操作

import { WeiboBaseOperation } from './weibo-base-operation';
import { WeiboHomepageContainer } from '../../containers/weibo/weibo-homepage-container';
import { WeiboPost, WeiboUser } from './weibo-data-models';
import { IExecutionContext } from '../../interfaces/core';
import { WeiboPageType, WeiboPageContext, WeiboPageDetector } from './weibo-page-types';
import { OperationCategory } from '../base-operation';

// 获取微博主页信息操作
export class GetHomepageInfoOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 10000,
        navigation: 5000,
        elementWait: 3000,
        ajax: 5000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const homepageContainer = this.getHomepageContainer(context);
    
    // 获取页面基本信息
    const pageContext = homepageContainer.getPageContext();
    
    // 检查登录状态
    const isLoggedIn = await homepageContainer.checkLoginStatus(context);
    
    // 获取当前用户信息
    const currentUser = isLoggedIn ? await homepageContainer.getCurrentUser(context) : null;
    
    // 获取Feed流信息
    const feedContainer = homepageContainer.getFeed();
    const postCount = feedContainer.getPostCount();
    
    // 获取热搜信息
    const sidebarContainer = homepageContainer.getSidebar();
    const hotSearchList = await sidebarContainer.getHotSearchList(context);
    
    // 获取推荐用户
    const recommendedUsers = await sidebarContainer.getRecommendedUsers(context);
    
    return {
      pageContext: {
        url: pageContext.url,
        title: pageContext.title,
        pageType: pageContext.pageType
      },
      authentication: {
        isLoggedIn,
        currentUser
      },
      feed: {
        postCount,
        posts: await this.getRecentPosts(context, homepageContainer, 5)
      },
      sidebar: {
        hotSearchList: hotSearchList.slice(0, 10),
        recommendedUsers: recommendedUsers.slice(0, 5)
      },
      timestamp: new Date()
    };
  }

  private getHomepageContainer(context: IExecutionContext): WeiboHomepageContainer {
    const container = context.container.getSubContainer('homepage');
    if (!container) {
      throw new Error('Homepage container not found');
    }
    return container as WeiboHomepageContainer;
  }

  private async getRecentPosts(context: IExecutionContext, homepageContainer: WeiboHomepageContainer, limit: number): Promise<WeiboPost[]> {
    const feedContainer = homepageContainer.getFeed();
    const postContainers = feedContainer.getPostContainers();
    
    const posts: WeiboPost[] = [];
    const takeCount = Math.min(limit, postContainers.length);
    
    for (let i = 0; i < takeCount; i++) {
      const postContainer = postContainers[i];
      const post = await postContainer.getPostContent(context);
      if (post) {
        posts.push(post);
      }
    }
    
    return posts;
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOMEPAGE];
  }
}

// 刷新Feed流操作
export class RefreshFeedOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 15000,
        navigation: 8000,
        elementWait: 5000,
        ajax: 7000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const homepageContainer = this.getHomepageContainer(context);
    const feedContainer = homepageContainer.getFeed();
    
    // 记录刷新前的帖子数量
    const beforeCount = feedContainer.getPostCount();
    
    // 执行刷新
    await feedContainer.refreshFeed(context);
    
    // 等待刷新完成
    await this.delay(3000);
    
    // 获取刷新后的帖子数量
    const afterCount = feedContainer.getPostCount();
    
    // 获取新增的帖子
    const newPosts = await this.getNewPosts(context, homepageContainer, beforeCount);
    
    return {
      success: true,
      beforeCount,
      afterCount,
      newPostsCount: afterCount - beforeCount,
      newPosts: newPosts.slice(0, 10), // 最多返回10条新帖子
      timestamp: new Date()
    };
  }

  private getHomepageContainer(context: IExecutionContext): WeiboHomepageContainer {
    const container = context.container.getSubContainer('homepage');
    if (!container) {
      throw new Error('Homepage container not found');
    }
    return container as WeiboHomepageContainer;
  }

  private async getNewPosts(context: IExecutionContext, homepageContainer: WeiboHomepageContainer, startIndex: number): Promise<WeiboPost[]> {
    const feedContainer = homepageContainer.getFeed();
    const postContainers = feedContainer.getPostContainers();
    
    const newPosts: WeiboPost[] = [];
    
    for (let i = startIndex; i < postContainers.length; i++) {
      const postContainer = postContainers[i];
      const post = await postContainer.getPostContent(context);
      if (post) {
        newPosts.push(post);
      }
    }
    
    return newPosts;
  }

  protected requiresLogin(): boolean {
    return true;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOMEPAGE];
  }
}

// 加载更多帖子操作
export class LoadMorePostsOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 20000,
        navigation: 10000,
        elementWait: 5000,
        ajax: 8000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const { count = 10 } = params;
    const homepageContainer = this.getHomepageContainer(context);
    const feedContainer = homepageContainer.getFeed();
    
    // 记录加载前的帖子数量
    const beforeCount = feedContainer.getPostCount();
    
    // 尝试加载更多帖子
    let loadedMore = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      loadedMore = await feedContainer.loadMorePosts(context);
      if (loadedMore) {
        break;
      }
      attempts++;
      await this.delay(2000);
    }
    
    // 获取加载后的帖子数量
    const afterCount = feedContainer.getPostCount();
    
    // 获取新加载的帖子
    const newPosts = await this.getNewPosts(context, homepageContainer, beforeCount, count);
    
    return {
      success: true,
      beforeCount,
      afterCount,
      loadedPostsCount: afterCount - beforeCount,
      requestedCount: count,
      newPosts: newPosts,
      hasMore: afterCount < beforeCount + count, // 判断是否还有更多
      attempts,
      timestamp: new Date()
    };
  }

  private getHomepageContainer(context: IExecutionContext): WeiboHomepageContainer {
    const container = context.container.getSubContainer('homepage');
    if (!container) {
      throw new Error('Homepage container not found');
    }
    return container as WeiboHomepageContainer;
  }

  private async getNewPosts(context: IExecutionContext, homepageContainer: WeiboHomepageContainer, startIndex: number, limit: number): Promise<WeiboPost[]> {
    const feedContainer = homepageContainer.getFeed();
    const postContainers = feedContainer.getPostContainers();
    
    const newPosts: WeiboPost[] = [];
    const endIndex = Math.min(startIndex + limit, postContainers.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      const postContainer = postContainers[i];
      const post = await postContainer.getPostContent(context);
      if (post) {
        newPosts.push(post);
      }
    }
    
    return newPosts;
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOMEPAGE];
  }
}

// 点赞帖子操作
export class LikePostOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 8000,
        navigation: 3000,
        elementWait: 3000,
        ajax: 5000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const { postIndex } = params;
    
    if (typeof postIndex !== 'number' || postIndex < 0) {
      throw new Error('Invalid post index');
    }
    
    const homepageContainer = this.getHomepageContainer(context);
    const feedContainer = homepageContainer.getFeed();
    const postContainer = feedContainer.getPostContainer(postIndex);
    
    if (!postContainer) {
      throw new Error(`Post container not found for index: ${postIndex}`);
    }
    
    // 获取点赞前的帖子信息
    const beforePost = await postContainer.getPostContent(context);
    
    // 执行点赞操作
    const success = await postContainer.likePost(context);
    
    // 获取点赞后的帖子信息
    const afterPost = await postContainer.getPostContent(context);
    
    return {
      success,
      postIndex,
      beforeLikeCount: beforePost?.likeCount || 0,
      afterLikeCount: afterPost?.likeCount || 0,
      wasLiked: beforePost?.isLiked || false,
      isLiked: afterPost?.isLiked || false,
      timestamp: new Date()
    };
  }

  private getHomepageContainer(context: IExecutionContext): WeiboHomepageContainer {
    const container = context.container.getSubContainer('homepage');
    if (!container) {
      throw new Error('Homepage container not found');
    }
    return container as WeiboHomepageContainer;
  }

  protected requiresLogin(): boolean {
    return true;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOMEPAGE];
  }
}

// 评论帖子操作
export class CommentPostOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 15000,
        navigation: 5000,
        elementWait: 5000,
        ajax: 8000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const { postIndex, comment } = params;
    
    if (typeof postIndex !== 'number' || postIndex < 0) {
      throw new Error('Invalid post index');
    }
    
    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      throw new Error('Invalid comment content');
    }
    
    const homepageContainer = this.getHomepageContainer(context);
    const feedContainer = homepageContainer.getFeed();
    const postContainer = feedContainer.getPostContainer(postIndex);
    
    if (!postContainer) {
      throw new Error(`Post container not found for index: ${postIndex}`);
    }
    
    // 获取评论前的帖子信息
    const beforePost = await postContainer.getPostContent(context);
    
    // 执行评论操作
    const success = await postContainer.commentPost(context, comment);
    
    // 获取评论后的帖子信息
    const afterPost = await postContainer.getPostContent(context);
    
    return {
      success,
      postIndex,
      comment: comment.trim(),
      beforeCommentCount: beforePost?.commentCount || 0,
      afterCommentCount: afterPost?.commentCount || 0,
      timestamp: new Date()
    };
  }

  private getHomepageContainer(context: IExecutionContext): WeiboHomepageContainer {
    const container = context.container.getSubContainer('homepage');
    if (!container) {
      throw new Error('Homepage container not found');
    }
    return container as WeiboHomepageContainer;
  }

  protected requiresLogin(): boolean {
    return true;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOMEPAGE];
  }
}

// 转发帖子操作
export class RepostPostOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 15000,
        navigation: 5000,
        elementWait: 5000,
        ajax: 8000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const { postIndex, repostContent = '' } = params;
    
    if (typeof postIndex !== 'number' || postIndex < 0) {
      throw new Error('Invalid post index');
    }
    
    const homepageContainer = this.getHomepageContainer(context);
    const feedContainer = homepageContainer.getFeed();
    const postContainer = feedContainer.getPostContainer(postIndex);
    
    if (!postContainer) {
      throw new Error(`Post container not found for index: ${postIndex}`);
    }
    
    // 获取转发前的帖子信息
    const beforePost = await postContainer.getPostContent(context);
    
    // 执行转发操作
    const success = await postContainer.repostPost(context, repostContent);
    
    // 获取转发后的帖子信息
    const afterPost = await postContainer.getPostContent(context);
    
    return {
      success,
      postIndex,
      repostContent: repostContent.trim(),
      beforeRepostCount: beforePost?.repostCount || 0,
      afterRepostCount: afterPost?.repostCount || 0,
      timestamp: new Date()
    };
  }

  private getHomepageContainer(context: IExecutionContext): WeiboHomepageContainer {
    const container = context.container.getSubContainer('homepage');
    if (!container) {
      throw new Error('Homepage container not found');
    }
    return container as WeiboHomepageContainer;
  }

  protected requiresLogin(): boolean {
    return true;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOMEPAGE];
  }
}

// 发布微博操作
export class PublishPostOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 20000,
        navigation: 5000,
        elementWait: 5000,
        ajax: 10000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const { content, images = [] } = params;
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Invalid post content');
    }
    
    const homepageContainer = this.getHomepageContainer(context);
    const postBoxContainer = homepageContainer.getPostBox();
    
    // 检查是否可以发布
    const canPost = await postBoxContainer.canPost(context);
    if (!canPost) {
      throw new Error('Cannot post - user may not be logged in');
    }
    
    // 上传图片（如果有）
    if (images.length > 0) {
      for (const imagePath of images) {
        await postBoxContainer.uploadImage(context, imagePath);
      }
    }
    
    // 发布微博
    const success = await postBoxContainer.publishPost(context, content);
    
    // 刷新Feed流以获取新发布的帖子
    if (success) {
      await this.delay(2000);
      const feedContainer = homepageContainer.getFeed();
      await feedContainer.refreshFeed(context);
    }
    
    return {
      success,
      content: content.trim(),
      imagesCount: images.length,
      timestamp: new Date()
    };
  }

  private getHomepageContainer(context: IExecutionContext): WeiboHomepageContainer {
    const container = context.container.getSubContainer('homepage');
    if (!container) {
      throw new Error('Homepage container not found');
    }
    return container as WeiboHomepageContainer;
  }

  protected requiresLogin(): boolean {
    return true;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOMEPAGE];
  }
}

// 获取热搜列表操作
export class GetHotSearchOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 8000,
        navigation: 3000,
        elementWait: 3000,
        ajax: 5000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const { limit = 20 } = params;
    
    const homepageContainer = this.getHomepageContainer(context);
    const sidebarContainer = homepageContainer.getSidebar();
    
    // 获取热搜列表
    const hotSearchList = await sidebarContainer.getHotSearchList(context);
    
    return {
      hotSearchList: hotSearchList.slice(0, limit),
      totalCount: hotSearchList.length,
      requestedLimit: limit,
      timestamp: new Date()
    };
  }

  private getHomepageContainer(context: IExecutionContext): WeiboHomepageContainer {
    const container = context.container.getSubContainer('homepage');
    if (!container) {
      throw new Error('Homepage container not found');
    }
    return container as WeiboHomepageContainer;
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOMEPAGE];
  }
}

// 获取推荐用户操作
export class GetRecommendedUsersOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 8000,
        navigation: 3000,
        elementWait: 3000,
        ajax: 5000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const { limit = 10 } = params;
    
    const homepageContainer = this.getHomepageContainer(context);
    const sidebarContainer = homepageContainer.getSidebar();
    
    // 获取推荐用户列表
    const recommendedUsers = await sidebarContainer.getRecommendedUsers(context);
    
    return {
      recommendedUsers: recommendedUsers.slice(0, limit),
      totalCount: recommendedUsers.length,
      requestedLimit: limit,
      timestamp: new Date()
    };
  }

  private getHomepageContainer(context: IExecutionContext): WeiboHomepageContainer {
    const container = context.container.getSubContainer('homepage');
    if (!container) {
      throw new Error('Homepage container not found');
    }
    return container as WeiboHomepageContainer;
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOMEPAGE];
  }
}

// 导航操作
export class NavigateOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 10000,
        navigation: 5000,
        elementWait: 3000,
        ajax: 5000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const { target } = params;
    
    if (!target || typeof target !== 'string') {
      throw new Error('Invalid navigation target');
    }
    
    const homepageContainer = this.getHomepageContainer(context);
    const navigationContainer = homepageContainer.getNavigation();
    
    let success = false;
    let navigatedTo = '';
    
    switch (target.toLowerCase()) {
      case 'home':
        await navigationContainer.navigateToHome(context);
        navigatedTo = 'home';
        success = true;
        break;
      case 'discover':
        await navigationContainer.navigateToDiscover(context);
        navigatedTo = 'discover';
        success = true;
        break;
      case 'message':
        await navigationContainer.navigateToMessage(context);
        navigatedTo = 'message';
        success = true;
        break;
      case 'profile':
        await navigationContainer.navigateToProfile(context);
        navigatedTo = 'profile';
        success = true;
        break;
      default:
        throw new Error(`Invalid navigation target: ${target}`);
    }
    
    // 等待导航完成
    await this.delay(2000);
    
    return {
      success,
      target,
      navigatedTo,
      timestamp: new Date()
    };
  }

  private getHomepageContainer(context: IExecutionContext): WeiboHomepageContainer {
    const container = context.container.getSubContainer('homepage');
    if (!container) {
      throw new Error('Homepage container not found');
    }
    return container as WeiboHomepageContainer;
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOMEPAGE];
  }
}