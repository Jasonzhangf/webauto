// 新浪微博各页面类型的具体链接提取操作
// 针对不同页面结构优化的精确链接提取

import { BaseLinkExtractionOperation } from './weibo-link-extraction-operations';
import { IExecutionContext } from '../../interfaces/core';
import { WeiboPageType, WeiboPageContext } from './weibo-page-types';
import { WeiboLink, LinkExtractionParams, LinkExtractionResult } from './weibo-link-extraction-mapping';
import { OperationCategory } from '../base-operation';

// 微博主页链接提取操作
export class HomepageLinkExtractionOperation extends BaseLinkExtractionOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<LinkExtractionResult> {
    // 验证页面类型
    const pageContext = await this.initializePageContext(context);
    if (pageContext.pageType !== WeiboPageType.HOMEPAGE) {
      throw new Error(`This operation only supports homepage, current page type: ${pageContext.pageType}`);
    }

    // 针对主页优化的提取策略
    const optimizedParams = this.optimizeHomepageParams(params);
    
    // 执行基础提取
    const result = await super.executeWeiboOperation(context, optimizedParams);
    
    // 主页特定的后处理
    return this.processHomepageResult(result);
  }

  private optimizeHomepageParams(params: any): LinkExtractionParams {
    const baseParams: LinkExtractionParams = {
      targetTypes: params.targetTypes || ['post', 'user', 'topic', 'hashtag', 'image', 'video', 'external'],
      maxCount: params.maxCount || 100,
      containerFilter: params.containerFilter,
      urlFilter: params.urlFilter ? new RegExp(params.urlFilter) : undefined,
      titleFilter: params.titleFilter ? new RegExp(params.titleFilter) : undefined,
      includeMetadata: params.includeMetadata !== false,
      includePosition: params.includePosition !== false,
      sortBy: params.sortBy || 'position'
    };

    // 主页特定的容器优先级
    if (!params.containerFilter) {
      // 主页上优先从Feed流提取
      baseParams.containerFilter = 'feed';
    }

    return baseParams;
  }

  private processHomepageResult(result: LinkExtractionResult): LinkExtractionResult {
    // 主站特定的结果处理
    // 1. 为链接添加更多上下文信息
    result.links = result.links.map(link => ({
      ...link,
      context: {
        pageType: 'homepage',
        section: this.inferHomepageSection(link.sourceContainer)
      }
    }));

    // 2. 按重要性排序（帖子链接优先）
    result.links.sort((a, b) => {
      const priorityOrder = ['post', 'user', 'topic', 'hashtag', 'video', 'image', 'external'];
      const aPriority = priorityOrder.indexOf(a.type);
      const bPriority = priorityOrder.indexOf(b.type);
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      return a.position.index - b.position.index;
    });

    return result;
  }

  private inferHomepageSection(containerName: string): string {
    if (containerName.includes('feed')) return 'feed';
    if (containerName.includes('sidebar')) return 'sidebar';
    if (containerName.includes('navigation')) return 'navigation';
    if (containerName.includes('hot')) return 'hotSearch';
    return 'other';
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOMEPAGE];
  }
}

// 用户主页链接提取操作
export class UserProfileLinkExtractionOperation extends BaseLinkExtractionOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<LinkExtractionResult> {
    // 验证页面类型
    const pageContext = await this.initializePageContext(context);
    if (pageContext.pageType !== WeiboPageType.USER_PROFILE) {
      throw new Error(`This operation only supports user profile pages, current page type: ${pageContext.pageType}`);
    }

    // 针对用户主页优化的提取策略
    const optimizedParams = this.optimizeUserProfileParams(params);
    
    // 执行基础提取
    const result = await super.executeWeiboOperation(context, optimizedParams);
    
    // 用户主页特定的后处理
    return this.processUserProfileResult(result, pageContext);
  }

  private optimizeUserProfileParams(params: any): LinkExtractionParams {
    const baseParams: LinkExtractionParams = {
      targetTypes: params.targetTypes || ['post', 'user', 'topic', 'hashtag', 'image', 'video'],
      maxCount: params.maxCount || 100,
      containerFilter: params.containerFilter,
      urlFilter: params.urlFilter ? new RegExp(params.urlFilter) : undefined,
      titleFilter: params.titleFilter ? new RegExp(params.titleFilter) : undefined,
      includeMetadata: params.includeMetadata !== false,
      includePosition: params.includePosition !== false,
      sortBy: params.sortBy || 'position'
    };

    // 用户主页特定的容器优先级
    if (!params.containerFilter) {
      baseParams.containerFilter = 'posts';
    }

    return baseParams;
  }

  private processUserProfileResult(result: LinkExtractionResult, pageContext: WeiboPageContext): LinkExtractionResult {
    // 提取用户ID从URL
    const userIdMatch = pageContext.url.match(/u\/(\d+)/);
    const userId = userIdMatch ? userIdMatch[1] : null;

    // 用户主页特定的结果处理
    result.links = result.links.map(link => ({
      ...link,
      context: {
        pageType: 'userProfile',
        userId,
        section: this.inferUserProfileSection(link.sourceContainer),
        isOwnProfile: this.isOwnProfile(pageContext, link)
      }
    }));

    // 为用户链接添加关注状态信息
    result.links = result.links.map(link => {
      if (link.type === 'user') {
        return {
          ...link,
          metadata: {
            ...link.metadata,
            followStatus: this.inferFollowStatus(link)
          }
        };
      }
      return link;
    });

    return result;
  }

  private inferUserProfileSection(containerName: string): string {
    if (containerName.includes('posts')) return 'posts';
    if (containerName.includes('follow')) return 'following';
    if (containerName.includes('fans')) return 'followers';
    if (containerName.includes('info')) return 'userInfo';
    return 'other';
  }

  private isOwnProfile(pageContext: WeiboPageContext, link: WeiboLink): boolean {
    // 简单的判断逻辑，实际需要根据页面状态判断
    return link.sourceContainer === 'userInfo';
  }

  private inferFollowStatus(link: WeiboLink): 'following' | 'notFollowing' | 'unknown' {
    // 简单的推断逻辑，实际需要从页面元素判断
    return 'unknown';
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.USER_PROFILE];
  }
}

// 微博详情页链接提取操作
export class PostDetailLinkExtractionOperation extends BaseLinkExtractionOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<LinkExtractionResult> {
    // 验证页面类型
    const pageContext = await this.initializePageContext(context);
    if (pageContext.pageType !== WeiboPageType.POST_DETAIL) {
      throw new Error(`This operation only supports post detail pages, current page type: ${pageContext.pageType}`);
    }

    // 针对详情页优化的提取策略
    const optimizedParams = this.optimizePostDetailParams(params);
    
    // 执行基础提取
    const result = await super.executeWeiboOperation(context, optimizedParams);
    
    // 详情页特定的后处理
    return this.processPostDetailResult(result, pageContext);
  }

  private optimizePostDetailParams(params: any): LinkExtractionParams {
    const baseParams: LinkExtractionParams = {
      targetTypes: params.targetTypes || ['post', 'user', 'topic', 'hashtag', 'image', 'video', 'external'],
      maxCount: params.maxCount || 200, // 详情页通常有更多链接
      containerFilter: params.containerFilter,
      urlFilter: params.urlFilter ? new RegExp(params.urlFilter) : undefined,
      titleFilter: params.titleFilter ? new RegExp(params.titleFilter) : undefined,
      includeMetadata: params.includeMetadata !== false,
      includePosition: params.includePosition !== false,
      sortBy: params.sortBy || 'position'
    };

    // 详情页特定的容器优先级
    if (!params.containerFilter) {
      // 详情页优先从评论和转发列表提取
      baseParams.containerFilter = 'comments';
    }

    return baseParams;
  }

  private processPostDetailResult(result: LinkExtractionResult, pageContext: WeiboPageContext): LinkExtractionResult {
    // 提取帖子ID从URL
    const postIdMatch = pageContext.url.match(/status\/(\d+)/);
    const postId = postIdMatch ? postIdMatch[1] : null;

    // 详情页特定的结果处理
    result.links = result.links.map(link => ({
      ...link,
      context: {
        pageType: 'postDetail',
        postId,
        section: this.inferPostDetailSection(link.sourceContainer),
        relationToPost: this.inferRelationToPost(link)
      }
    }));

    // 按与原帖的关系分组
    const groupedLinks = this.groupLinksByRelation(result.links);
    
    return {
      ...result,
      links: result.links,
      groupedLinks
    };
  }

  private inferPostDetailSection(containerName: string): string {
    if (containerName.includes('comment')) return 'comments';
    if (containerName.includes('repost')) return 'reposts';
    if (containerName.includes('content')) return 'postContent';
    if (containerName.includes('like')) return 'likes';
    return 'other';
  }

  private inferRelationToPost(link: WeiboLink): 'original' | 'comment' | 'repost' | 'mention' | 'other' {
    if (link.sourceContainer.includes('content')) return 'original';
    if (link.sourceContainer.includes('comment')) return 'comment';
    if (link.sourceContainer.includes('repost')) return 'repost';
    if (link.type === 'user' && link.sourceContainer.includes('content')) return 'mention';
    return 'other';
  }

  private groupLinksByRelation(links: WeiboLink[]): Record<string, WeiboLink[]> {
    const grouped: Record<string, WeiboLink[]> = {
      original: [],
      comments: [],
      reposts: [],
      mentions: [],
      other: []
    };

    links.forEach(link => {
      const relation = this.inferRelationToPost(link);
      switch (relation) {
        case 'original':
          grouped.original.push(link);
          break;
        case 'comment':
          grouped.comments.push(link);
          break;
        case 'repost':
          grouped.reposts.push(link);
          break;
        case 'mention':
          grouped.mentions.push(link);
          break;
        default:
          grouped.other.push(link);
      }
    });

    return grouped;
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.POST_DETAIL];
  }
}

// 搜索结果页链接提取操作
export class SearchResultsLinkExtractionOperation extends BaseLinkExtractionOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<LinkExtractionResult> {
    // 验证页面类型
    const pageContext = await this.initializePageContext(context);
    if (pageContext.pageType !== WeiboPageType.SEARCH_RESULTS) {
      throw new Error(`This operation only supports search results pages, current page type: ${pageContext.pageType}`);
    }

    // 针对搜索结果页优化的提取策略
    const optimizedParams = this.optimizeSearchResultsParams(params, pageContext);
    
    // 执行基础提取
    const result = await super.executeWeiboOperation(context, optimizedParams);
    
    // 搜索结果页特定的后处理
    return this.processSearchResultsResult(result, pageContext);
  }

  private optimizeSearchResultsParams(params: any, pageContext: WeiboPageContext): LinkExtractionParams {
    const baseParams: LinkExtractionParams = {
      targetTypes: params.targetTypes || ['post', 'user', 'topic'],
      maxCount: params.maxCount || 100,
      containerFilter: params.containerFilter,
      urlFilter: params.urlFilter ? new RegExp(params.urlFilter) : undefined,
      titleFilter: params.titleFilter ? new RegExp(params.titleFilter) : undefined,
      includeMetadata: params.includeMetadata !== false,
      includePosition: params.includePosition !== false,
      sortBy: params.sortBy || 'position'
    };

    // 搜索结果页特定的容器优先级
    if (!params.containerFilter) {
      baseParams.containerFilter = 'searchResults';
    }

    // 添加搜索关键词过滤
    const searchKeyword = this.extractSearchKeyword(pageContext);
    if (searchKeyword && !params.titleFilter) {
      baseParams.titleFilter = new RegExp(searchKeyword, 'i');
    }

    return baseParams;
  }

  private processSearchResultsResult(result: LinkExtractionResult, pageContext: WeiboPageContext): LinkExtractionResult {
    // 提取搜索关键词
    const searchKeyword = this.extractSearchKeyword(pageContext);

    // 搜索结果页特定的结果处理
    result.links = result.links.map(link => ({
      ...link,
      context: {
        pageType: 'searchResults',
        searchKeyword,
        resultType: this.inferSearchResultType(link),
        relevanceScore: this.calculateRelevanceScore(link, searchKeyword)
      }
    }));

    // 按相关性排序
    result.links.sort((a, b) => {
      const aScore = a.context?.relevanceScore || 0;
      const bScore = b.context?.relevanceScore || 0;
      return bScore - aScore; // 降序排列
    });

    return result;
  }

  private extractSearchKeyword(pageContext: WeiboPageContext): string | null {
    // 从URL或页面标题提取搜索关键词
    const urlMatch = pageContext.url.match(/search\?q=([^&]+)/);
    if (urlMatch) {
      return decodeURIComponent(urlMatch[1]);
    }
    
    const titleMatch = pageContext.title.match(/搜索[：:](.+)/);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
    
    return null;
  }

  private inferSearchResultType(link: WeiboLink): 'post' | 'user' | 'topic' | 'other' {
    switch (link.type) {
      case 'post':
        return 'post';
      case 'user':
        return 'user';
      case 'topic':
      case 'hashtag':
        return 'topic';
      default:
        return 'other';
    }
  }

  private calculateRelevanceScore(link: WeiboLink, searchKeyword: string | null): number {
    if (!searchKeyword) return 0;

    const keyword = searchKeyword.toLowerCase();
    const title = link.title.toLowerCase();
    
    // 完全匹配得分最高
    if (title === keyword) return 100;
    
    // 包含关键词得分次之
    if (title.includes(keyword)) return 80;
    
    // 部分匹配
    const words = keyword.split(' ');
    const matchCount = words.filter(word => title.includes(word)).length;
    
    return (matchCount / words.length) * 50;
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.SEARCH_RESULTS];
  }
}

// 热搜页面链接提取操作
export class HotSearchLinkExtractionOperation extends BaseLinkExtractionOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<LinkExtractionResult> {
    // 验证页面类型
    const pageContext = await this.initializePageContext(context);
    if (pageContext.pageType !== WeiboPageType.HOT_SEARCH) {
      throw new Error(`This operation only supports hot search pages, current page type: ${pageContext.pageType}`);
    }

    // 针对热搜页优化的提取策略
    const optimizedParams = this.optimizeHotSearchParams(params);
    
    // 执行基础提取
    const result = await super.executeWeiboOperation(context, optimizedParams);
    
    // 热搜页特定的后处理
    return this.processHotSearchResult(result);
  }

  private optimizeHotSearchParams(params: any): LinkExtractionParams {
    const baseParams: LinkExtractionParams = {
      targetTypes: params.targetTypes || ['topic', 'hashtag'],
      maxCount: params.maxCount || 50, // 热搜通常不会太多
      containerFilter: params.containerFilter || 'hot',
      urlFilter: params.urlFilter ? new RegExp(params.urlFilter) : undefined,
      titleFilter: params.titleFilter ? new RegExp(params.titleFilter) : undefined,
      includeMetadata: params.includeMetadata !== false,
      includePosition: params.includePosition !== false,
      sortBy: params.sortBy || 'position'
    };

    return baseParams;
  }

  private processHotSearchResult(result: LinkExtractionResult): LinkExtractionResult {
    // 热搜页特定的结果处理
    result.links = result.links.map((link, index) => ({
      ...link,
      context: {
        pageType: 'hotSearch',
        ranking: index + 1,
        isHot: this.isHotTopic(link),
        isNew: this.isNewTopic(link),
        category: this.inferTopicCategory(link)
      }
    }));

    // 按热搜排名排序
    result.links.sort((a, b) => {
      const aRank = a.context?.ranking || 999;
      const bRank = b.context?.ranking || 999;
      return aRank - bRank;
    });

    // 添加热搜统计信息
    result.hotSearchStats = {
      totalTopics: result.links.length,
      hotTopics: result.links.filter(link => link.context?.isHot).length,
      newTopics: result.links.filter(link => link.context?.isNew).length,
      categories: this.groupByCategory(result.links)
    };

    return result;
  }

  private isHotTopic(link: WeiboLink): boolean {
    // 简单的判断逻辑，实际需要从页面元素判断
    return link.title.includes('热') || link.title.includes('爆');
  }

  private isNewTopic(link: WeiboLink): boolean {
    // 简单的判断逻辑，实际需要从页面元素判断
    return link.title.includes('新') || link.title.includes('刚刚');
  }

  private inferTopicCategory(link: WeiboLink): string {
    const title = link.title.toLowerCase();
    
    if (title.includes('娱乐') || title.includes('明星')) return 'entertainment';
    if (title.includes('体育') || title.includes('足球') || title.includes('篮球')) return 'sports';
    if (title.includes('科技') || title.includes('手机') || title.includes('ai')) return 'tech';
    if (title.includes('财经') || title.includes('股票') || title.includes('股市')) return 'finance';
    if (title.includes('社会') || title.includes('新闻')) return 'social';
    if (title.includes('国际') || title.includes('国外')) return 'international';
    
    return 'other';
  }

  private groupByCategory(links: WeiboLink[]): Record<string, number> {
    const categories: Record<string, number> = {};
    
    links.forEach(link => {
      const category = link.context?.category || 'other';
      categories[category] = (categories[category] || 0) + 1;
    });
    
    return categories;
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [WeiboPageType.HOT_SEARCH];
  }
}