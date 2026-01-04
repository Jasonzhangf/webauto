/**
 * 容器消息注册表
 * 支持根容器定义消息，验证消息载荷
 */

import { MessageBusService } from './MessageBusService.js';

export interface MessageDefinition {
  name: string;
  description?: string;
  payload?: Record<string, string>;
  broadcast?: boolean;
  ttl?: number;
  persist?: boolean;
  scope?: 'root' | 'container';
}

export interface MessageRegistration {
  containerId: string;
  message: MessageDefinition;
}

export class ContainerMessageRegistry {
  private messageDefinitions: Map<string, MessageRegistration> = new Map();
  private messageBus: MessageBusService;

  constructor(messageBus: MessageBusService) {
    this.messageBus = messageBus;
  }

  /**
   * 注册容器消息
   */
  registerMessages(containerId: string, messages: MessageDefinition[]): void {
    for (const msg of messages) {
      this.validateMessageDefinition(msg);
      
      this.messageDefinitions.set(msg.name, {
        containerId,
        message: {
          ...msg,
          scope: msg.scope || 'container'
        }
      });
    }
  }

  /**
   * 获取消息定义
   */
  getMessageDefinition(messageName: string): MessageDefinition | null {
    const registration = this.messageDefinitions.get(messageName);
    return registration?.message || null;
  }

  /**
   * 获取容器消息列表
   */
  getContainerMessages(containerId: string): MessageDefinition[] {
    const messages: MessageDefinition[] = [];
    for (const reg of this.messageDefinitions.values()) {
      if (reg.containerId === containerId) {
        messages.push(reg.message);
      }
    }
    return messages;
  }

  /**
   * 验证消息载荷
   */
  validatePayload(messageName: string, payload: Record<string, any>): boolean {
    const def = this.getMessageDefinition(messageName);
    if (!def || !def.payload) return true;

    for (const [key, type] of Object.entries(def.payload)) {
      if (!(key in payload)) {
        console.warn(`[MessageRegistry] 缺少字段: ${key} in ${messageName}`);
        return false;
      }

      const actualType = Array.isArray(payload[key]) ? 'array' : typeof payload[key];
      if (actualType !== type) {
        console.warn(`[MessageRegistry] 类型错误: ${key} 应为 ${type}，实际为 ${actualType}`);
        return false;
      }
    }

    return true;
  }

  /**
   * 发布消息（带验证）
   */
  async publishMessage(
    messageName: string,
    payload: Record<string, any>,
    source: { component: string; containerId?: string }
  ): Promise<void> {
    const def = this.getMessageDefinition(messageName);
    
    if (def && !this.validatePayload(messageName, payload)) {
      throw new Error(`消息载荷验证失败: ${messageName}`);
    }

    await this.messageBus.publish(messageName, payload, {
      component: source.component,
      containerId: source.containerId
    });
  }

  /**
   * 清除容器消息
   */
  removeContainerMessages(containerId: string): void {
    for (const [name, reg] of this.messageDefinitions.entries()) {
      if (reg.containerId === containerId) {
        this.messageDefinitions.delete(name);
      }
    }
  }

  /**
   * 获取所有消息定义
   */
  getAllMessages(): MessageDefinition[] {
    return Array.from(this.messageDefinitions.values()).map(reg => reg.message);
  }

  private validateMessageDefinition(msg: MessageDefinition): void {
    if (!msg.name.startsWith('MSG_')) {
      throw new Error(`消息名称必须以 MSG_ 开头: ${msg.name}`);
    }

    if (msg.payload) {
      for (const [key, type] of Object.entries(msg.payload)) {
        if (!key || !type) {
          throw new Error(`消息载荷定义不完整: ${msg.name}`);
        }
      }
    }
  }
}
