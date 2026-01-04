import { MessageBusService } from './MessageBusService.js';
import { ContainerVariableManager } from './ContainerVariableManager.js';
import { TriggerConditionEvaluator } from './TriggerConditionEvaluator.js';
import { MessageRpcClient } from './MessageRpcClient.js';
import {
  MSG_CONTAINER_ROOT_DISCOVER_START,
  MSG_CONTAINER_ROOT_DISCOVER_PROGRESS,
  MSG_CONTAINER_ROOT_DISCOVER_COMPLETE,
  MSG_CONTAINER_CHILD_DISCOVERED,
  MSG_CONTAINER_MATCH_START,
  MSG_CONTAINER_MATCH_SUCCESS,
  MSG_CONTAINER_MATCH_FAILED,
  MSG_CONTAINER_APPEAR,
  CMD_BROWSER_DOM_QUERY,
  RES_BROWSER_DOM_QUERY
} from './MessageConstants.js';

/**
 * 容器定义
 * (这里简化了定义，实际项目中应该引用完整的 ContainerDefinition)
 */
export interface ContainerDefinition {
  id: string;
  name: string;
  selector: string;
  required?: boolean;
  multiple?: boolean;
  children?: ContainerDefinition[];
  // 其他属性...
}

/**
 * 发现的容器实例
 */
export interface DiscoveredContainer {
  id: string;              // 运行时唯一ID
  definitionId: string;    // 定义ID
  index: number;           // 同类容器中的索引
  element: any;            // DOM 元素引用 (在 RPC 模式下，这里可能是 ElementHandle 的 ID 引用)
  parentId?: string;       // 父容器ID
  data?: Record<string, any>; // 提取的数据
}

/**
 * 容器发现引擎
 * 负责扫描页面 DOM，匹配容器定义，生成容器实例
 */
export class ContainerDiscoveryEngine {
  private messageBus: MessageBusService;
  private variableManager: ContainerVariableManager;
  private conditionEvaluator: TriggerConditionEvaluator;
  private rpcClient: MessageRpcClient;
  private discoveredContainers: Map<string, DiscoveredContainer> = new Map();

  constructor(
    messageBus: MessageBusService,
    variableManager: ContainerVariableManager,
    conditionEvaluator: TriggerConditionEvaluator
  ) {
    this.messageBus = messageBus;
    this.variableManager = variableManager;
    this.conditionEvaluator = conditionEvaluator;
    this.rpcClient = new MessageRpcClient(messageBus);
    this.rpcClient.init(RES_BROWSER_DOM_QUERY);
  }

  /**
   * 开始发现流程
   * @param rootDefinition 根容器定义
   * @param rootElement 根元素 (可选)
   */
  public async startDiscovery(rootDefinition: ContainerDefinition, rootElement?: any): Promise<DiscoveredContainer[]> {
    const discoveryId = `discovery_${Date.now()}`;
    
    await this.messageBus.publish(MSG_CONTAINER_ROOT_DISCOVER_START, {
      discoveryId,
      rootDefinitionId: rootDefinition.id
    }, { component: 'ContainerDiscoveryEngine' });

    // 清理上一轮发现结果（如果是全量重新发现）
    // this.discoveredContainers.clear(); 

    const results: DiscoveredContainer[] = [];
    
    try {
      // 1. 发现根容器
      const rootInstance = await this.findContainer(rootDefinition, rootElement, 0);
      
      if (rootInstance) {
        results.push(rootInstance);
        this.registerContainer(rootInstance);
        
        // 2. 递归发现子容器
        if (rootDefinition.children && rootDefinition.children.length > 0) {
          const childResults = await this.discoverChildren(rootDefinition.children, rootInstance);
          results.push(...childResults);
        }
      }

      await this.messageBus.publish(MSG_CONTAINER_ROOT_DISCOVER_COMPLETE, {
        discoveryId,
        count: results.length
      }, { component: 'ContainerDiscoveryEngine' });

      return results;

    } catch (error) {
      console.error('[ContainerDiscoveryEngine] Discovery failed:', error);
      throw error;
    }
  }

  /**
   * 发现子容器
   */
  private async discoverChildren(
    definitions: ContainerDefinition[], 
    parentInstance: DiscoveredContainer
  ): Promise<DiscoveredContainer[]> {
    const results: DiscoveredContainer[] = [];

    for (const def of definitions) {
      // 通过 RPC 查询 DOM 元素
      const elements = await this.findElements(def.selector, parentInstance.element);
      
      for (let i = 0; i < elements.length; i++) {
        const instance = await this.createContainerInstance(def, elements[i], i, parentInstance.id);
        results.push(instance);
        this.registerContainer(instance);
        
        // 递归发现孙容器
        if (def.children && def.children.length > 0) {
          const grandChildren = await this.discoverChildren(def.children, instance);
          results.push(...grandChildren);
        }

        // 如果不是多重容器，只取第一个
        if (!def.multiple) break;
      }
    }

    return results;
  }

  /**
   * 查找单个容器
   */
  private async findContainer(
    def: ContainerDefinition, 
    element?: any, 
    index: number = 0
  ): Promise<DiscoveredContainer | null> {
    await this.messageBus.publish(MSG_CONTAINER_MATCH_START, {
      definitionId: def.id,
      selector: def.selector
    }, { component: 'ContainerDiscoveryEngine' });

    // 如果提供了元素，直接验证；否则查找
    let foundElement = element;
    if (!foundElement) {
      const elements = await this.findElements(def.selector);
      foundElement = elements[0];
    }

    if (foundElement) {
      await this.messageBus.publish(MSG_CONTAINER_MATCH_SUCCESS, {
        definitionId: def.id
      }, { component: 'ContainerDiscoveryEngine' });
      
      return this.createContainerInstance(def, foundElement, index);
    } else {
      await this.messageBus.publish(MSG_CONTAINER_MATCH_FAILED, {
        definitionId: def.id
      }, { component: 'ContainerDiscoveryEngine' });
      
      return null;
    }
  }

  /**
   * 创建容器实例
   */
  private async createContainerInstance(
    def: ContainerDefinition, 
    element: any, 
    index: number,
    parentId?: string
  ): Promise<DiscoveredContainer> {
    const id = `${def.id}_${index}_${Math.random().toString(36).substr(2, 5)}`;
    
    const instance: DiscoveredContainer = {
      id,
      definitionId: def.id,
      index,
      element,
      parentId
    };

    
    await this.messageBus.publish(MSG_CONTAINER_APPEAR, {
      containerId: id,
      definitionId: def.id,
      parentId: parentId,
      index: index
    }, { component: 'ContainerDiscoveryEngine' });

    return instance;
  }

  /**
   * 注册发现的容器
   */
  private async registerContainer(instance: DiscoveredContainer): Promise<void> {
    this.discoveredContainers.set(instance.id, instance);
    
    // 初始化变量
    this.variableManager.initContainerVariables(instance.id, [], {});
    
    await this.messageBus.publish(MSG_CONTAINER_CHILD_DISCOVERED, {
      containerId: instance.id,
      definitionId: instance.definitionId,
      index: instance.index,
      parentId: instance.parentId
    }, { component: 'ContainerDiscoveryEngine' });
  }

  /**
   * 查找元素 (RPC 实现)
   * 返回的是元素引用的列表 (ObjectId)
   */
  private async findElements(selector: string, rootElementId?: string): Promise<string[]> {
    try {
      const response = await this.rpcClient.call<string[]>(CMD_BROWSER_DOM_QUERY, {
        selector,
        rootElementId
      });

      if (response.success && Array.isArray(response.data)) {
        return response.data;
      }
      return [];
    } catch (error) {
      console.warn(`[ContainerDiscoveryEngine] findElements RPC failed for ${selector}:`, error);
      return [];
    }
  }
}
