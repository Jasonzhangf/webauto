// 新浪微博链接提取基础操作
// 基于容器映射关系的精确链接提取

import { WeiboBaseOperation } from './weibo-base-operation';
import { IExecutionContext } from '../../interfaces/core';
import { WeiboPageType, WeiboPageContext, WeiboPageDetector } from './weibo-page-types';
import { 
  WeiboLink, 
  LinkExtractionParams, 
  LinkExtractionResult,
  ContainerMapping,
  PAGE_CONTAINER_MAPPINGS,
  OperationLocator 
} from './weibo-link-extraction-mapping';
import { OperationCategory } from '../base-operation';

// 基础链接提取操作
export class BaseLinkExtractionOperation extends WeiboBaseOperation {
  protected operationLocator: OperationLocator;
  protected currentMapping: ContainerMapping | null = null;

  constructor() {
    super({
      timeout: {
        default: 30000,
        navigation: 10000,
        elementWait: 5000,
        ajax: 8000
      }
    });
    
    this.operationLocator = new OperationLocator();
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<LinkExtractionResult> {
    const startTime = Date.now();
    
    // 初始化页面上下文
    const pageContext = await this.initializePageContext(context);
    
    // 获取容器映射
    this.currentMapping = this.operationLocator.getContainerMapping(pageContext.pageType);
    if (!this.currentMapping) {
      throw new Error(`No container mapping found for page type: ${pageContext.pageType}`);
    }
    
    // 解析提取参数
    const extractionParams: LinkExtractionParams = this.parseExtractionParams(params);
    
    // 执行链接提取
    const links = await this.extractLinks(context, extractionParams);
    
    // 处理结果
    const result: LinkExtractionResult = {
      success: true,
      pageContext: {
        url: pageContext.url,
        title: pageContext.title,
        pageType: pageContext.pageType
      },
      links,
      summary: this.generateSummary(links, extractionParams),
      params: extractionParams,
      timestamp: new Date()
    };
    
    // 添加处理时间
    const processingTime = Date.now() - startTime;
    result.summary.processingTime = processingTime;
    
    return result;
  }

  protected parseExtractionParams(params: any): LinkExtractionParams {
    return {
      targetTypes: params.targetTypes || ['post', 'user', 'topic', 'hashtag', 'image', 'video', 'external'],
      maxCount: params.maxCount || 100,
      containerFilter: params.containerFilter,
      urlFilter: params.urlFilter ? new RegExp(params.urlFilter) : undefined,
      titleFilter: params.titleFilter ? new RegExp(params.titleFilter) : undefined,
      includeMetadata: params.includeMetadata !== false,
      includePosition: params.includePosition !== false,
      sortBy: params.sortBy || 'position'
    };
  }

  protected async extractLinks(context: IExecutionContext, params: LinkExtractionParams): Promise<WeiboLink[]> {
    if (!this.currentMapping) {
      throw new Error('Container mapping not initialized');
    }

    const allLinks: WeiboLink[] = [];
    
    // 遍历所有容器
    for (const [containerName, containerConfig] of Object.entries(this.currentMapping.containers)) {
      // 检查容器过滤器
      if (params.containerFilter && !containerName.includes(params.containerFilter)) {
        continue;
      }
      
      // 检查容器是否支持目标链接类型
      const supportedTypes = containerConfig.linkTypes.filter(type => 
        params.targetTypes?.includes(type)
      );
      
      if (supportedTypes.length === 0) {
        continue;
      }
      
      // 从容器中提取链接
      const containerLinks = await this.extractLinksFromContainer(
        context, 
        containerName, 
        containerConfig, 
        supportedTypes,
        params
      );
      
      allLinks.push(...containerLinks);
    }
    
    // 应用过滤和排序
    return this.processLinks(allLinks, params);
  }

  protected async extractLinksFromContainer(
    context: IExecutionContext,
    containerName: string,
    containerConfig: any,
    supportedTypes: WeiboLink['type'][],
    params: LinkExtractionParams
  ): Promise<WeiboLink[]> {
    const links: WeiboLink[] = [];
    
    try {
      // 查找容器元素
      const containerElement = await context.page?.$(containerConfig.selector);
      if (!containerElement) {
        this.warn(`Container element not found: ${containerName}`);
        return links;
      }
      
      // 查找容器内的所有链接元素
      const linkElements = await containerElement.$$('a');
      if (!linkElements || linkElements.length === 0) {
        return links;
      }
      
      // 处理每个链接元素
      for (let i = 0; i < linkElements.length; i++) {
        const linkElement = linkElements[i];
        const link = await this.processLinkElement(
          context,
          linkElement,
          containerName,
          containerConfig,
          supportedTypes,
          i,
          params
        );
        
        if (link) {
          links.push(link);
        }
        
        // 检查是否达到最大数量限制
        if (links.length >= params.maxCount!) {
          break;
        }
      }
      
    } catch (error) {
      this.warn(`Error extracting links from container ${containerName}`, { 
        error: (error as Error).message 
      });
    }
    
    return links;
  }

  protected async processLinkElement(
    context: IExecutionContext,
    linkElement: any,
    containerName: string,
    containerConfig: any,
    supportedTypes: WeiboLink['type'][],
    index: number,
    params: LinkExtractionParams
  ): Promise<WeiboLink | null> {
    try {
      // 获取链接URL和标题
      const url = await linkElement.getAttribute('href') || '';
      const title = await linkElement.textContent() || '';
      
      if (!url || url.trim() === '') {
        return null;
      }
      
      // 推断链接类型
      const linkType = this.operationLocator.inferLinkType(
        this.currentMapping!.pageType, 
        url
      );
      
      // 检查链接类型是否在支持的目标类型中
      if (!linkType || !supportedTypes.includes(linkType)) {
        return null;
      }
      
      // 应用URL过滤器
      if (params.urlFilter && !params.urlFilter.test(url)) {
        return null;
      }
      
      // 应用标题过滤器
      if (params.titleFilter && !params.titleFilter.test(title)) {
        return null;
      }
      
      // 构建链接对象
      const link: WeiboLink = {
        url: url.startsWith('http') ? url : `https://weibo.com${url}`,
        title: title.trim(),
        type: linkType,
        sourceElement: linkElement.constructor.name,
        sourceContainer: containerName,
        position: {
          index,
          container: containerName
        }
      };
      
      // 添加元数据
      if (params.includeMetadata) {
        link.metadata = await this.extractMetadata(context, linkElement, url, linkType);
      }
      
      // 添加位置信息
      if (params.includePosition) {
        try {
          const xpath = await context.page?.evaluate((el) => {
            const xpath = (node: any) => {
              if (node.nodeType !== Node.ELEMENT_NODE) return '';
              
              const idx = (sib: any, name: string) => {
                let count = 1;
                for (let sib = node.previousSibling; sib; sib = sib.previousSibling) {
                  if (sib.nodeType === Node.ELEMENT_NODE && sib.nodeName === name) {
                    count++;
                  }
                }
                return count > 1 ? `[${count}]` : '';
              };
              
              const path = [];
              let parent = node;
              while (parent && parent.nodeType === Node.ELEMENT_NODE) {
                const name = parent.nodeName.toLowerCase();
                const index = idx(parent, name);
                path.unshift(name + index);
                parent = parent.parentNode;
              }
              return path.length ? '/' + path.join('/') : '';
            };
            
            return xpath(el);
          }, linkElement);
          
          link.position.xpath = xpath;
        } catch (error) {
          // 忽略XPath提取错误
        }
      }
      
      return link;
      
    } catch (error) {
      this.warn(`Error processing link element`, { 
        error: (error as Error).message,
        container: containerName,
        index 
      });
      return null;
    }
  }

  protected async extractMetadata(
    context: IExecutionContext,
    linkElement: any,
    url: string,
    linkType: WeiboLink['type']
  ): Promise<Record<string, any>> {
    const metadata: Record<string, any> = {};
    
    if (!this.currentMapping) {
      return metadata;
    }
    
    const patternInfo = this.currentMapping.linkPatterns[linkType];
    if (!patternInfo || !patternInfo.metadataExtractors) {
      return metadata;
    }
    
    // 执行元数据提取器
    for (const [key, extractor] of Object.entries(patternInfo.metadataExtractors)) {
      try {
        metadata[key] = await extractor(linkElement, url);
      } catch (error) {
        this.warn(`Error extracting metadata ${key}`, { 
          error: (error as Error).message,
          url,
          linkType 
        });
      }
    }
    
    return metadata;
  }

  protected processLinks(links: WeiboLink[], params: LinkExtractionParams): WeiboLink[] {
    let processedLinks = [...links];
    
    // 应用最大数量限制
    if (params.maxCount && processedLinks.length > params.maxCount) {
      processedLinks = processedLinks.slice(0, params.maxCount);
    }
    
    // 排序
    switch (params.sortBy) {
      case 'url':
        processedLinks.sort((a, b) => a.url.localeCompare(b.url));
        break;
      case 'title':
        processedLinks.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'type':
        processedLinks.sort((a, b) => a.type.localeCompare(b.type));
        break;
      case 'position':
      default:
        processedLinks.sort((a, b) => a.position.index - b.position.index);
        break;
    }
    
    return processedLinks;
  }

  protected generateSummary(links: WeiboLink[], params: LinkExtractionParams) {
    const byType: Record<WeiboLink['type'], number> = {
      post: 0,
      user: 0,
      topic: 0,
      image: 0,
      video: 0,
      external: 0,
      hashtag: 0
    };
    
    links.forEach(link => {
      byType[link.type]++;
    });
    
    return {
      totalLinks: links.length,
      byType,
      extractedCount: links.length,
      processingTime: 0
    };
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

// 通用链接提取操作
export class ExtractLinksOperation extends BaseLinkExtractionOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<LinkExtractionResult> {
    return super.executeWeiboOperation(context, params);
  }
}

// 按类型提取链接操作
export class ExtractLinksByTypeOperation extends BaseLinkExtractionOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<WeiboLink[]> {
    const { linkType, ...otherParams } = params;
    
    if (!linkType) {
      throw new Error('Link type is required');
    }
    
    // 调用基础链接提取，但只返回指定类型的链接
    const result = await super.executeWeiboOperation(context, {
      ...otherParams,
      targetTypes: [linkType]
    });
    
    return result.links;
  }
}

// 提取微博帖子链接操作
export class ExtractPostLinksOperation extends ExtractLinksByTypeOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<WeiboLink[]> {
    return super.executeWeiboOperation(context, {
      ...params,
      linkType: 'post'
    });
  }
}

// 提取用户链接操作
export class ExtractUserLinksOperation extends ExtractLinksByTypeOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<WeiboLink[]> {
    return super.executeWeiboOperation(context, {
      ...params,
      linkType: 'user'
    });
  }
}

// 提取话题链接操作
export class ExtractTopicLinksOperation extends ExtractLinksByTypeOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<WeiboLink[]> {
    return super.executeWeiboOperation(context, {
      ...params,
      linkType: 'topic'
    });
  }
}

// 提取话题标签链接操作
export class ExtractHashtagLinksOperation extends ExtractLinksByTypeOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<WeiboLink[]> {
    return super.executeWeiboOperation(context, {
      ...params,
      linkType: 'hashtag'
    });
  }
}

// 提取图片链接操作
export class ExtractImageLinksOperation extends ExtractLinksByTypeOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<WeiboLink[]> {
    return super.executeWeiboOperation(context, {
      ...params,
      linkType: 'image'
    });
  }
}

// 提取视频链接操作
export class ExtractVideoLinksOperation extends ExtractLinksByTypeOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<WeiboLink[]> {
    return super.executeWeiboOperation(context, {
      ...params,
      linkType: 'video'
    });
  }
}

// 提取外部链接操作
export class ExtractExternalLinksOperation extends ExtractLinksByTypeOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<WeiboLink[]> {
    return super.executeWeiboOperation(context, {
      ...params,
      linkType: 'external'
    });
  }
}

// 从指定容器提取链接操作
export class ExtractLinksFromContainerOperation extends BaseLinkExtractionOperation {
  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<LinkExtractionResult> {
    const { containerName, ...otherParams } = params;
    
    if (!containerName) {
      throw new Error('Container name is required');
    }
    
    // 调用基础链接提取，但只从指定容器提取
    return super.executeWeiboOperation(context, {
      ...otherParams,
      containerFilter: containerName
    });
  }
}

// 验证链接类型操作
export class ValidateLinkTypeOperation extends WeiboBaseOperation {
  protected operationLocator: OperationLocator;

  constructor() {
    super({
      timeout: {
        default: 5000,
        navigation: 2000,
        elementWait: 1000,
        ajax: 2000
      }
    });
    
    this.operationLocator = new OperationLocator();
  }

  protected async executeWeiboOperation(context: IExecutionContext, params: any): Promise<any> {
    const { url, linkType } = params;
    
    if (!url || !linkType) {
      throw new Error('URL and link type are required');
    }
    
    // 初始化页面上下文
    const pageContext = await this.initializePageContext(context);
    
    // 验证链接类型
    const isValid = this.operationLocator.validateLinkType(
      pageContext.pageType,
      url,
      linkType
    );
    
    // 推断链接类型
    const inferredType = this.operationLocator.inferLinkType(
      pageContext.pageType,
      url
    );
    
    return {
      url,
      requestedType: linkType,
      isValid,
      inferredType,
      pageType: pageContext.pageType,
      timestamp: new Date()
    };
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