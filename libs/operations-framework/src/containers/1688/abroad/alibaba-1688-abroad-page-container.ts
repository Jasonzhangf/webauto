/**
 * 1688 海外版 页面容器（适配器）
 * 与国内站分离，便于针对不同 DOM/流程进行定制
 */

import { BaseSelfRefreshingContainer, ContainerConfig, RefreshTrigger } from '../../BaseSelfRefreshingContainer';
import { OperationResult } from '../../../core/types/OperatorTypes';

export interface Alibaba1688AbroadPageConfig extends ContainerConfig {
  pageType: 'homepage' | 'search' | 'product' | 'category';
  url?: string;
  locale?: string;
}

export class Alibaba1688AbroadPageContainer extends BaseSelfRefreshingContainer {
  protected config: Alibaba1688AbroadPageConfig;

  constructor(config: Alibaba1688AbroadPageConfig) {
    super({
      refreshInterval: 3000,
      enableAutoRefresh: true,
      enableMutationObserver: true,
      maxRefreshRetries: 3,
      debounceTime: 1000,
      childContainerTypes: [],
      ...config
    });
    this.config = config;
  }

  protected setPageContext(page: any): void { this.page = page; }
  protected async executeWithContext<T>(fn: (page: any) => Promise<T>): Promise<T> {
    if (!this.page) throw new Error('页面上下文未设置');
    return await fn(this.page);
  }

  protected async createChildContainer(): Promise<BaseSelfRefreshingContainer> {
    throw new Error('Alibaba1688AbroadPageContainer 暂不支持子容器');
  }

  protected async executeDynamicOperation(): Promise<OperationResult> {
    return OperationResult.failure('未实现的动态操作');
  }

  protected async performRefresh(trigger: RefreshTrigger): Promise<OperationResult> {
    try {
      const stateUpdate = await this.detectContainerState(this.page);
      this.updateState(stateUpdate as any);

      await this.registerDynamicOperations(this.page);
      await this.handleTriggerSpecificActions(trigger);

      return OperationResult.success({
        adapter: '1688-abroad',
        pageType: this.config.pageType,
        trigger: trigger.type,
        exists: stateUpdate.exists,
        visible: stateUpdate.visible,
        timestamp: Date.now()
      });
    } catch (error: any) {
      return OperationResult.failure(`1688 海外版页面容器刷新失败: ${error.message}`, error);
    }
  }
}

export default Alibaba1688AbroadPageContainer;

