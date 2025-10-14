/**
 * 1688 国内站 链接容器（适配器）
 * 负责基础链接发现（占位实现），遵循自刷新容器模式
 */

import { BaseSelfRefreshingContainer, ContainerConfig, RefreshTrigger } from '../../BaseSelfRefreshingContainer.js';
import { OperationResult } from '../../../core/types/OperatorTypes.js';

export interface Alibaba1688DomesticLinkConfig extends ContainerConfig {
  maxLinks?: number;
  linkPatterns?: (string | RegExp)[];
}

export class Alibaba1688DomesticLinkContainer extends BaseSelfRefreshingContainer {
  protected config: Alibaba1688DomesticLinkConfig;

  constructor(config: Alibaba1688DomesticLinkConfig) {
    super({
      refreshInterval: 2000,
      enableAutoRefresh: true,
      enableMutationObserver: true,
      maxRefreshRetries: 3,
      debounceTime: 800,
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
    throw new Error('Alibaba1688DomesticLinkContainer 不支持子容器');
  }

  protected async executeDynamicOperation(): Promise<OperationResult> {
    return OperationResult.failure('未实现的动态操作');
  }

  protected async performRefresh(trigger: RefreshTrigger): Promise<OperationResult> {
    try {
      const stateUpdate = await this.detectContainerState(this.page);
      this.updateState(stateUpdate as any);

      // 预留：注册滚动 / 分页 / 链接提取操作
      await this.registerDynamicOperations(this.page);
      await this.handleTriggerSpecificActions(trigger);

      return OperationResult.success({
        adapter: '1688-domestic',
        container: 'link',
        trigger: trigger.type,
        exists: stateUpdate.exists,
        visible: stateUpdate.visible
      });
    } catch (error: any) {
      return OperationResult.failure(`1688 国内站链接容器刷新失败: ${error.message}`, error);
    }
  }
}

export default Alibaba1688DomesticLinkContainer;

