// 简化版微博链接提取操作
// 专注于实现核心链接提取功能

import { WeiboBaseOperation } from './weibo-base-operation';
import { IExecutionContext } from '../../interfaces/core';
import { WeiboPageType, WeiboPageContext, WeiboPageDetector } from './weibo-page-types';

// 简化的链接接口
export interface SimpleWeiboLink {
  url: string;
  title: string;
  type: 'post' | 'user' | 'topic' | 'hashtag' | 'image' | 'video' | 'external';
  sourceContainer: string;
  position: number;
}

// 简化的链接提取参数
export interface SimpleLinkExtractionParams {
  maxCount?: number;
  targetTypes?: string[];
  containerFilter?: string;
}

// 简化的链接提取结果
export interface SimpleLinkExtractionResult {
  success: boolean;
  pageType: WeiboPageType;
  links: SimpleWeiboLink[];
  totalCount: number;
  timestamp: Date;
}

// 简化的链接提取操作
export class SimpleExtractLinksOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 20000,
        navigation: 8000,
        elementWait: 5000,
        ajax: 6000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<SimpleLinkExtractionResult> {
    const startTime = Date.now();
    
    // 解析参数
    const {
      maxCount = 100,
      targetTypes = ['post', 'user', 'topic', 'hashtag', 'image', 'video', 'external'],
      containerFilter
    } = params as SimpleLinkExtractionParams;

    // 初始化页面上下文
    const pageContext = await this.initializePageContext(context);
    
    // 提取链接
    const links = await this.extractLinksFromPage(context, {
      maxCount,
      targetTypes,
      containerFilter
    });

    return {
      success: true,
      pageType: pageContext.pageType,
      links,
      totalCount: links.length,
      timestamp: new Date()
    };
  }

  private async extractLinksFromPage(
    context: IExecutionContext,
    params: SimpleLinkExtractionParams
  ): Promise<SimpleWeiboLink[]> {
    const allLinks: SimpleWeiboLink[] = [];
    
    try {
      // 获取页面上的所有链接元素
      const linkElements = await context.page?.$$('a');
      
      if (!linkElements || linkElements.length === 0) {
        return allLinks;
      }

      // 处理每个链接
      for (let i = 0; i < linkElements.length; i++) {
        if (allLinks.length >= params.maxCount!) {
          break;
        }

        const link = await this.processLinkElement(context, linkElements[i], i, params);
        if (link) {
          allLinks.push(link);
        }
      }
    } catch (error) {
      this.warn('Error extracting links from page', { error: (error as Error).message });
    }

    return allLinks;
  }

  private async processLinkElement(
    context: IExecutionContext,
    linkElement: any,
    index: number,
    params: SimpleLinkExtractionParams
  ): Promise<SimpleWeiboLink | null> {
    try {
      // 获取链接URL和标题
      const url = await linkElement.getAttribute('href') || '';
      const title = await linkElement.textContent() || '';
      
      if (!url || url.trim() === '') {
        return null;
      }

      // 推断链接类型
      const linkType = this.inferLinkType(url);
      
      // 检查是否在目标类型中
      if (!params.targetTypes?.includes(linkType)) {
        return null;
      }

      // 构建链接对象
      const link: SimpleWeiboLink = {
        url: url.startsWith('http') ? url : `https://weibo.com${url}`,
        title: title.trim(),
        type: linkType,
        sourceContainer: this.inferSourceContainer(linkElement),
        position: index
      };

      return link;
    } catch (error) {
      this.warn('Error processing link element', { error: (error as Error).message, index });
      return null;
    }
  }

  private inferLinkType(url: string): SimpleWeiboLink['type'] {
    // 微博帖子链接
    if (url.includes('/status/') || url.match(/weibo\.com\/\d+\/[a-zA-Z0-9]+/)) {
      return 'post';
    }
    
    // 用户链接
    if (url.includes('/u/') || url.match(/weibo\.com\/[a-zA-Z0-9_]+$/)) {
      return 'user';
    }
    
    // 搜索链接
    if (url.includes('search?')) {
      return 'topic';
    }
    
    // 话题标签
    if (url.includes('#') && url.includes('#')) {
      return 'hashtag';
    }
    
    // 图片链接
    if (url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
      return 'image';
    }
    
    // 视频链接
    if (url.match(/\.(mp4|mov|avi|flv)(\?.*)?$/i)) {
      return 'video';
    }
    
    // 外部链接
    if (url.startsWith('http') && !url.includes('weibo.com')) {
      return 'external';
    }
    
    // 默认为外部链接
    return 'external';
  }

  private inferSourceContainer(element: any): string {
    // 简单的容器推断逻辑
    // 实际实现需要检查元素的父级容器
    return 'unknown';
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [
      WeiboPageType.HOMEPAGE,
      WeiboPageType.USER_PROFILE,
      WeiboPageType.POST_DETAIL,
      WeiboPageType.SEARCH_RESULTS,
      WeiboPageType.HOT_SEARCH
    ];
  }
}

// 按类型提取链接的简化操作
export class SimpleExtractLinksByTypeOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 15000,
        navigation: 6000,
        elementWait: 4000,
        ajax: 5000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<SimpleWeiboLink[]> {
    const { linkType, maxCount = 50 } = params;
    
    if (!linkType) {
      throw new Error('Link type is required');
    }
    
    // 使用基础提取操作，但只返回指定类型
    const baseOperation = new SimpleExtractLinksOperation();
    const result = await baseOperation.executeWeiboOperation(context, {
      targetTypes: [linkType],
      maxCount
    });
    
    return result.links;
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [
      WeiboPageType.HOMEPAGE,
      WeiboPageType.USER_PROFILE,
      WeiboPageType.POST_DETAIL,
      WeiboPageType.SEARCH_RESULTS,
      WeiboPageType.HOT_SEARCH
    ];
  }
}

// 提取微博帖子链接的简化操作
export class SimpleExtractPostLinksOperation extends SimpleExtractLinksByTypeOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<SimpleWeiboLink[]> {
    return super.executeWeiboOperation(context, {
      ...params,
      linkType: 'post'
    });
  }
}

// 提取用户链接的简化操作
export class SimpleExtractUserLinksOperation extends SimpleExtractLinksByTypeOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<SimpleWeiboLink[]> {
    return super.executeWeiboOperation(context, {
      ...params,
      linkType: 'user'
    });
  }
}

// 提取话题链接的简化操作
export class SimpleExtractTopicLinksOperation extends SimpleExtractLinksByTypeOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<SimpleWeiboLink[]> {
    return super.executeWeiboOperation(context, {
      ...params,
      linkType: 'topic'
    });
  }
}

// 提取图片链接的简化操作
export class SimpleExtractImageLinksOperation extends SimpleExtractLinksByTypeOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<SimpleWeiboLink[]> {
    return super.executeWeiboOperation(context, {
      ...params,
      linkType: 'image'
    });
  }
}

// 验证链接类型的简化操作
export class SimpleValidateLinkTypeOperation extends WeiboBaseOperation {
  constructor() {
    super({
      timeout: {
        default: 5000,
        navigation: 2000,
        elementWait: 1000,
        ajax: 2000
      }
    });
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const { url, linkType } = params;
    
    if (!url || !linkType) {
      throw new Error('URL and link type are required');
    }
    
    // 简单的链接类型验证
    const inferredType = this.inferLinkType(url);
    const isValid = inferredType === linkType;
    
    return {
      url,
      requestedType: linkType,
      inferredType,
      isValid,
      timestamp: new Date()
    };
  }

  private inferLinkType(url: string): string {
    // 使用与提取操作相同的推断逻辑
    if (url.includes('/status/') || url.match(/weibo\.com\/\d+\/[a-zA-Z0-9]+/)) {
      return 'post';
    }
    
    if (url.includes('/u/') || url.match(/weibo\.com\/[a-zA-Z0-9_]+$/)) {
      return 'user';
    }
    
    if (url.includes('search?')) {
      return 'topic';
    }
    
    if (url.includes('#') && url.includes('#')) {
      return 'hashtag';
    }
    
    if (url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
      return 'image';
    }
    
    if (url.match(/\.(mp4|mov|avi|flv)(\?.*)?$/i)) {
      return 'video';
    }
    
    if (url.startsWith('http') && !url.includes('weibo.com')) {
      return 'external';
    }
    
    return 'external';
  }

  protected requiresLogin(): boolean {
    return false;
  }

  protected getSupportedPageTypes(): WeiboPageType[] {
    return [
      WeiboPageType.HOMEPAGE,
      WeiboPageType.USER_PROFILE,
      WeiboPageType.POST_DETAIL,
      WeiboPageType.SEARCH_RESULTS,
      WeiboPageType.HOT_SEARCH
    ];
  }
}