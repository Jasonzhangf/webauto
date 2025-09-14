// 用户主页容器实现
import { BaseContainer } from '../containers/base-container';
import { SystemStateCenter } from '../core/system-state-center';
import { 
  IEntityRegistration, 
  IEntityState, 
  ContainerNode
} from '../interfaces/core';
import { UserProfile, Post } from '../operations/base-operation';

// 导入操作（稍后实现）
class ExtractUserInfoOperation { 
  async execute(context: any, params: any): Promise<any> { 
    return {}; 
  } 
}

class ExtractPostsOperation { 
  async execute(context: any, params: any): Promise<any> { 
    return []; 
  } 
}

class NextPageOperation { 
  async execute(context: any, params: any): Promise<any> { 
    return false; 
  } 
}

class HasMoreOperation { 
  async execute(context: any, params: any): Promise<any> { 
    return false; 
  } 
}

export class UserProfileContainer extends BaseContainer {
  private userProfileNode: BaseContainer;
  private postListNode: BaseContainer;
  private paginationNode: BaseContainer;
  
  private userInfo: UserProfile | null = null;
  private posts: Post[] = [];
  private currentPage: number = 1;
  
  constructor(config: any = {}) {
    super({
      id: 'UserProfileContainer',
      name: 'User Profile Container',
      description: 'Container for extracting user profile information and posts',
      ...config
    });
    
    // Create placeholder child containers
    this.userProfileNode = new SimpleContainer({
      id: 'userProfile',
      name: 'User Profile',
      type: 'container'
    });
    this.postListNode = new SimpleContainer({
      id: 'postList', 
      name: 'Post List',
      type: 'container'
    });
    this.paginationNode = new SimpleContainer({
      id: 'pagination',
      name: 'Pagination', 
      type: 'container'
    });
  }
  
  protected async registerToStateCenter(): Promise<void> {
    const registration: IEntityRegistration = {
      id: this.containerId,
      name: this.name,
      type: 'container',
      metadata: {
        version: this.version,
        description: 'User profile container for weibo',
        tags: ['user', 'profile', 'container']
      },
      statePattern: {
        properties: ['status', 'discovered', 'elementCount', 'userInfo', 'posts'],
        metrics: ['loadTime', 'operationCount', 'currentPage'],
        events: ['user_info_extracted', 'posts_loaded', 'page_changed']
      },
      monitoring: {
        enabled: true,
        interval: 5000,
        healthCheck: true
      },
      lifecycle: {
        onRegistered: this.onRegistered.bind(this),
        onStateChange: this.onStateChange.bind(this)
      }
    };
    
    await this.stateCenter.registerEntity(registration);
  }
  
  protected async initializeChildren(): Promise<void> {
    // 建立层级关系
    this.children.set('userProfile', this.userProfileNode);
    this.children.set('postList', this.postListNode);
    this.children.set('pagination', this.paginationNode);
    
    // 注册子容器到状态中心
    await this.registerChildToStateCenter(this.userProfileNode);
    await this.registerChildToStateCenter(this.postListNode);
    await this.registerChildToStateCenter(this.paginationNode);
    
    this.logInfo('Child containers initialized');
  }
  
  protected async registerOperations(): Promise<void> {
    // 用户信息提取操作
    this.operations.set('extractUserInfo', new ExtractUserInfoOperation() as any);
    
    // 微博列表操作
    this.operations.set('extractPosts', new ExtractPostsOperation() as any);
    
    // 分页操作
    this.operations.set('nextPage', new NextPageOperation() as any);
    this.operations.set('hasMore', new HasMoreOperation() as any);
    
    this.logInfo('Operations registered');
  }
  
  protected async doInitialize(): Promise<void> {
    // 初始化容器特定的状态
    const initialProperties = new Map<string, any>();
    initialProperties.set('discovered', false);
    initialProperties.set('elementCount', 0);
    initialProperties.set('currentPage', 1);
    initialProperties.set('totalPosts', 0);
    
    await this.updateContainerState({
      properties: initialProperties
    });
  }
  
  // 实现抽象方法
  async discoverElements(): Promise<void> {
    this.logInfo('Discovering elements in user profile container');
    
    try {
      // 查找用户信息元素
      await this.discoverUserInfoElements();
      
      // 查找微博列表元素
      await this.discoverPostListElements();
      
      // 查找分页元素
      await this.discoverPaginationElements();
      
      // 更新状态
      const discoveredProperties = new Map<string, any>();
      discoveredProperties.set('discovered', true);
      discoveredProperties.set('elementCount', await this.getElementCount());
      
      await this.updateContainerState({
        properties: discoveredProperties
      });
      
      this.logInfo('Elements discovered successfully');
      
    } catch (error) {
      await this.handleError(error as Error, 'discoverElements');
      throw error;
    }
  }
  
  async extractData(): Promise<any> {
    this.logInfo('Extracting data from user profile container');
    
    try {
      // 提取用户信息
      const userInfo = await this.extractUserInfoInternal();
      
      // 提取微博列表
      const posts = await this.extractPostsInternal({ limit: 10 });
      
      const result = {
        userInfo,
        posts,
        containerStats: this.getContainerStats()
      };
      
      this.logInfo('Data extracted successfully', { 
        userInfo: userInfo?.username, 
        postsCount: posts.length 
      });
      
      return result;
      
    } catch (error) {
      await this.handleError(error as Error, 'extractData');
      throw error;
    }
  }
  
  // 用户信息提取
  async extractUserInfoInternal(): Promise<UserProfile | null> {
    try {
      const result = await this.executeOperation('extractUserInfo', {});
      
      if (result) {
        this.userInfo = result;
        const userInfoProperties = new Map<string, any>();
        userInfoProperties.set('userInfo', result);
        userInfoProperties.set('lastUserInfoUpdate', Date.now());
        
        await this.updateContainerState({
          properties: userInfoProperties
        });
        
        // 触发事件
        this.logInfo('User info extracted event', { userInfo: result });
      }
      
      return result;
      
    } catch (error) {
      await this.handleError(error as Error, 'extractUserInfo');
      return null;
    }
  }
  
  // 微博列表提取
  async extractPostsInternal(params: { limit?: number } = {}): Promise<Post[]> {
    try {
      const { limit = 20 } = params;
      const result = await this.executeOperation('extractPosts', { limit });
      
      if (result && Array.isArray(result)) {
        this.posts = result;
        const postsProperties = new Map<string, any>();
        postsProperties.set('posts', result);
        postsProperties.set('lastPostsUpdate', Date.now());
        
        await this.updateContainerState({
          properties: postsProperties
        });
        
        // 触发事件
        this.logInfo('Posts loaded event', { posts: result, count: result.length });
      }
      
      return result || [];
      
    } catch (error) {
      await this.handleError(error as Error, 'extractPosts');
      return [];
    }
  }
  
  // 分页操作
  async nextPage(): Promise<boolean> {
    try {
      const hasMore = await this.hasMore();
      if (!hasMore) {
        this.logInfo('No more pages available');
        return false;
      }
      
      const result = await this.executeOperation('nextPage', {});
      
      if (result) {
        this.currentPage++;
        const pageProperties = new Map<string, any>();
        pageProperties.set('currentPage', this.currentPage);
        
        const pageMetrics = new Map<string, number | string>();
        pageMetrics.set('currentPage', this.currentPage.toString());
        
        await this.updateContainerState({
          properties: pageProperties,
          metrics: pageMetrics
        });
        
        // 触发事件
        this.logInfo('Page changed event', { 
          page: this.currentPage, 
          container: this.containerId 
        });
        
        this.logInfo(`Navigated to page ${this.currentPage}`);
        return true;
      }
      
      return false;
      
    } catch (error) {
      await this.handleError(error as Error, 'nextPage');
      return false;
    }
  }
  
  // 检查是否还有更多页面
  async hasMore(): Promise<boolean> {
    try {
      const result = await this.executeOperation('hasMore', {});
      return result || false;
      
    } catch (error) {
      await this.handleError(error as Error, 'hasMore');
      return false;
    }
  }
  
  // 获取用户信息
  getUserInfo(): UserProfile | null {
    return this.userInfo;
  }
  
  // 获取微博列表
  getPosts(): Post[] {
    return [...this.posts];
  }
  
  // 获取当前页码
  getCurrentPage(): number {
    return this.currentPage;
  }
  
  // 重置容器状态
  async reset(): Promise<void> {
    this.userInfo = null;
    this.posts = [];
    this.currentPage = 1;
    
    const resetProperties = new Map<string, any>();
    resetProperties.set('discovered', false);
    resetProperties.set('elementCount', 0);
    resetProperties.set('userInfo', null);
    resetProperties.set('posts', []);
    resetProperties.set('currentPage', 1);
    
    await this.updateContainerState({
      properties: resetProperties
    });
    
    this.logInfo('Container reset completed');
  }
  
  // 获取容器摘要信息
  getSummary(): any {
    return {
      id: this.containerId,
      name: this.name,
      userInfo: this.userInfo ? {
        username: this.userInfo.username,
        nickname: this.userInfo.nickname,
        postCount: this.userInfo.postCount
      } : null,
      postsCount: this.posts.length,
      currentPage: this.currentPage,
      hasMore: this.hasMore(),
      stats: this.getContainerStats()
    };
  }
  
  // 添加缺失的方法
  private async handleError(error: Error, context: string): Promise<void> {
    this.error(`Error in ${context}: ${error.message}`, { error: error.stack });
  }
  
  private getContainerStats(): any {
    return {
      childrenCount: this.children.size,
      operationsCount: this.operations.size,
      userInfoLoaded: this.userInfo !== null,
      postsLoaded: this.posts.length > 0
    };
  }
  
  // 私有方法
  private async discoverUserInfoElements(): Promise<void> {
    // 实现具体的元素发现逻辑
    // 这里需要根据微博页面的实际结构来实现
    this.logDebug('Discovering user info elements');
  }
  
  private async discoverPostListElements(): Promise<void> {
    // 实现具体的元素发现逻辑
    this.logDebug('Discovering post list elements');
  }
  
  private async discoverPaginationElements(): Promise<void> {
    // 实现具体的元素发现逻辑
    this.logDebug('Discovering pagination elements');
  }
  
  private async getElementCount(): Promise<number> {
    // 返回发现的元素数量
    return 0;
  }
  
  private async onRegistered(): Promise<void> {
    const registeredProperties = new Map<string, any>();
    registeredProperties.set('initialized', true);
    
    await this.updateContainerState({
      status: 'active',
      properties: registeredProperties
    });
    
    this.logInfo('User profile container registered to state center');
  }
  
  private async onStateChange(newState: IEntityState, changes: any): Promise<void> {
    this.logInfo('Container state changed', { changes });
    
    // 可以在这里添加状态变化时的业务逻辑
    if (changes.changes?.properties?.has('userInfo')) {
      this.logInfo('User info updated');
    }
    
    if (changes.changes?.properties?.has('posts')) {
      this.logInfo('Posts updated');
    }
  }
  
  private async registerChildToStateCenter(child: ContainerNode): Promise<void> {
    const registration: IEntityRegistration = {
      id: child.id,
      name: child.name,
      type: 'container',
      metadata: {
        description: `Child container: ${child.name}`
      },
      monitoring: {
        enabled: true,
        interval: 5000,
        healthCheck: true
      }
    };
    
    await this.stateCenter.registerEntity(registration);
  }
  
  // 实现基础工具方法
  protected async waitForElement(selector: string, timeout: number = 10000): Promise<any> {
    // 这里需要根据具体的页面操作框架实现
    // 例如：return await this.page.waitForSelector(selector, { timeout });
    this.logDebug(`Waiting for element: ${selector}`);
    return null;
  }
  
  protected async clickElement(element: any): Promise<void> {
    // 这里需要根据具体的页面操作框架实现
    // 例如：await element.click();
    this.logDebug('Clicking element');
  }
  
  protected async extractText(element: any): Promise<string> {
    // 这里需要根据具体的页面操作框架实现
    // 例如：return await element.textContent();
    this.logDebug('Extracting text from element');
    return '';
  }
  
  protected async scrollToElement(element: any): Promise<void> {
    // 这里需要根据具体的页面操作框架实现
    // 例如：await element.scrollIntoView();
    this.logDebug('Scrolling to element');
  }
  
  // 实现抽象方法
  protected getRootSelector(): string | null {
    return '.user-profile-container';
  }
  
  protected async createSubContainer(element: any, containerType: string): Promise<BaseContainer | null> {
    // 创建子容器的简单实现
    return new SimpleContainer({
      id: `${this.id}_${containerType}_${Date.now()}`,
      name: `${containerType} Container`,
      type: 'container'
    });
  }
  
  // 添加updateContainerState方法
  protected async updateContainerState(update: any): Promise<void> {
    const currentState = this.stateCenter.getEntityState(this.containerId);
    const updatedState: any = {
      ...currentState,
      timestamp: Date.now()
    };
    
    if (update.status) {
      updatedState.status = update.status;
    }
    
    if (update.properties) {
      updatedState.properties = new Map([...(currentState?.properties || []), ...update.properties]);
    }
    
    if (update.metrics) {
      updatedState.metrics = new Map([...(currentState?.metrics || []), ...update.metrics]);
    }
    
    await this.stateCenter.updateEntityState(this.containerId, updatedState);
  }
}

// 简单容器实现
class SimpleContainer extends BaseContainer {
  protected async registerToStateCenter(): Promise<void> {
    // 简单实现，不注册到状态中心
  }
  
  protected async initializeChildren(): Promise<void> {
    // 简单实现，无子容器
  }
  
  protected async registerOperations(): Promise<void> {
    // 简单实现，无操作
  }
  
  protected getRootSelector(): string | null {
    return null;
  }
  
  protected async createSubContainer(element: any, containerType: string): Promise<BaseContainer | null> {
    return null;
  }
}