import { MessageBusService } from './MessageBusService.js';
import {
  MSG_CONTAINER_VAR_CHANGED,
  MSG_CONTAINER_ROOT_VAR_CHANGED,
  MSG_CONTAINER_VAR_SET,
  MSG_CONTAINER_VAR_GET,
  MSG_CONTAINER_VAR_DELETE,
  MSG_CONTAINER_ROOT_VAR_SET,
  MSG_CONTAINER_ROOT_VAR_GET,
  MSG_CONTAINER_ROOT_VAR_DELETE
} from './MessageConstants.js';

/**
 * 变量值类型
 */
export type VariableValue = string | number | boolean | null | undefined | object;

/**
 * 变量定义
 */
export interface VariableDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'any';
  defaultValue?: VariableValue;
  required?: boolean;
  description?: string;
}

/**
 * 容器变量存储结构
 */
interface VariableStorage {
  [containerId: string]: {
    [key: string]: VariableValue;
  };
}

/**
 * 容器变量管理器
 * 负责管理根容器和子容器的变量状态
 * 支持通过消息进行读写操作
 */
export class ContainerVariableManager {
  private variables: VariableStorage = {};
  private messageBus: MessageBusService;
  private rootContainerId: string | null = null;

  constructor(messageBus: MessageBusService) {
    this.messageBus = messageBus;
    this.setupMessageListeners();
  }

  /**
   * 设置根容器ID
   * @param id 根容器ID
   */
  public setRootContainerId(id: string): void {
    this.rootContainerId = id;
    if (!this.variables[id]) {
      this.variables[id] = {};
    }
  }

  /**
   * 初始化容器变量
   * @param containerId 容器ID
   * @param definitions 变量定义列表
   * @param initialValues 初始值
   */
  public initContainerVariables(
    containerId: string, 
    definitions: VariableDefinition[] = [], 
    initialValues: Record<string, VariableValue> = {}
  ): void {
    if (!this.variables[containerId]) {
      this.variables[containerId] = {};
    }

    // 应用默认值
    for (const def of definitions) {
      if (def.defaultValue !== undefined) {
        this.variables[containerId][def.name] = def.defaultValue;
      }
    }

    // 应用初始值
    for (const [key, value] of Object.entries(initialValues)) {
      this.setVariable(containerId, key, value, false); // 初始化时不触发变更事件
    }
  }

  /**
   * 清理容器变量
   * @param containerId 容器ID
   */
  public clearContainerVariables(containerId: string): void {
    delete this.variables[containerId];
  }

  /**
   * 设置变量值
   * @param containerId 容器ID
   * @param key 变量名
   * @param value 变量值
   * @param emitEvent 是否触发变更事件
   */
  public setVariable(containerId: string, key: string, value: VariableValue, emitEvent = true): void {
    if (!this.variables[containerId]) {
      this.variables[containerId] = {};
    }

    const oldValue = this.variables[containerId][key];
    
    // 只有值发生变化时才更新和触发事件（对于对象类型，这里是浅比较，可能需要深比较优化）
    if (oldValue !== value) {
      this.variables[containerId][key] = value;

      if (emitEvent) {
        this.emitChange(containerId, key, value, oldValue);
      }
    }
  }

  /**
   * 获取变量值
   * @param containerId 容器ID
   * @param key 变量名
   */
  public getVariable(containerId: string, key: string): VariableValue {
    return this.variables[containerId]?.[key];
  }

  /**
   * 获取容器所有变量
   * @param containerId 容器ID
   */
  public getAllVariables(containerId: string): Record<string, VariableValue> {
    return { ...this.variables[containerId] };
  }

  /**
   * 删除变量
   * @param containerId 容器ID
   * @param key 变量名
   */
  public deleteVariable(containerId: string, key: string): void {
    if (this.variables[containerId] && key in this.variables[containerId]) {
      const oldValue = this.variables[containerId][key];
      delete this.variables[containerId][key];
      this.emitChange(containerId, key, undefined, oldValue);
    }
  }

  /**
   * 设置根容器变量（快捷方法）
   * @param key 变量名
   * @param value 变量值
   */
  public setRootVariable(key: string, value: VariableValue): void {
    if (this.rootContainerId) {
      this.setVariable(this.rootContainerId, key, value);
    } else {
      console.warn('[ContainerVariableManager] Root container ID not set, cannot set root variable');
    }
  }

  /**
   * 获取根容器变量（快捷方法）
   * @param key 变量名
   */
  public getRootVariable(key: string): VariableValue {
    if (this.rootContainerId) {
      return this.getVariable(this.rootContainerId, key);
    }
    return undefined;
  }

  /**
   * 触发变更事件
   */
  private emitChange(containerId: string, key: string, newValue: VariableValue, oldValue: VariableValue): void {
    const isRoot = containerId === this.rootContainerId;
    const eventName = isRoot ? MSG_CONTAINER_ROOT_VAR_CHANGED : MSG_CONTAINER_VAR_CHANGED;
    
    this.messageBus.publish(eventName, {
      containerId,
      key,
      newValue,
      oldValue,
      timestamp: Date.now()
    });
  }

  /**
   * 设置消息监听
   */
  private setupMessageListeners(): void {
    // 监听设置变量消息
    this.messageBus.subscribe(MSG_CONTAINER_VAR_SET, (payload: any) => {
      if (payload && payload.containerId && payload.key) {
        this.setVariable(payload.containerId, payload.key, payload.value);
      }
    });

    // 监听根容器设置变量消息
    this.messageBus.subscribe(MSG_CONTAINER_ROOT_VAR_SET, (payload: any) => {
      if (this.rootContainerId && payload && payload.key) {
        this.setVariable(this.rootContainerId, payload.key, payload.value);
      }
    });

    // 监听删除变量消息
    this.messageBus.subscribe(MSG_CONTAINER_VAR_DELETE, (payload: any) => {
      if (payload && payload.containerId && payload.key) {
        this.deleteVariable(payload.containerId, payload.key);
      }
    });

    // 监听根容器删除变量消息
    this.messageBus.subscribe(MSG_CONTAINER_ROOT_VAR_DELETE, (payload: any) => {
      if (this.rootContainerId && payload && payload.key) {
        this.deleteVariable(this.rootContainerId, payload.key);
      }
    });
    
    // 注意：GET 消息通常需要请求-响应模式，这里暂不实现，因为主要是用于异步查询
    // 如果需要同步获取，应直接调用 manager 的方法
  }
}
