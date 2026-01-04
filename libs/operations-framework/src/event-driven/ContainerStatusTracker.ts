import { MessageBusService } from './MessageBusService.js';
import {
  MSG_CONTAINER_CHILD_DISCOVERED,
  MSG_CONTAINER_OPERATION_COMPLETE,
  MSG_CONTAINER_OPERATION_FAILED,
  MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE
} from './MessageConstants.js';

/**
 * 容器处理状态
 */
export const ContainerStatus = {
  DISCOVERED: 'discovered',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const;

export type ContainerStatusType = typeof ContainerStatus[keyof typeof ContainerStatus];

/**
 * 容器状态记录
 */
export interface ContainerState {
  id: string;
  status: ContainerStatusType;
  operationsCompleted: number;
  lastUpdateTime: number;
}

/**
 * 容器状态跟踪器
 * 负责跟踪所有容器的处理状态和进度
 */
export class ContainerStatusTracker {
  private messageBus: MessageBusService;
  private containerStates: Map<string, ContainerState> = new Map();
  private rootContainerId: string | null = null;
  private totalDiscovered: number = 0;
  private totalCompleted: number = 0;
  private totalFailed: number = 0;

  constructor(messageBus: MessageBusService) {
    this.messageBus = messageBus;
    this.setupListeners();
  }

  public setRootContainerId(id: string): void {
    this.rootContainerId = id;
  }

  public reset(): void {
    this.containerStates.clear();
    this.totalDiscovered = 0;
    this.totalCompleted = 0;
    this.totalFailed = 0;
  }

  public getProgress(): { completed: number, failed: number, total: number, percentage: number } {
    const total = this.totalDiscovered;
    if (total === 0) return { completed: 0, failed: 0, total: 0, percentage: 0 };
    
    return {
      completed: this.totalCompleted,
      failed: this.totalFailed,
      total,
      percentage: Math.round(((this.totalCompleted + this.totalFailed) / total) * 100)
    };
  }

  private setupListeners(): void {
   // 监听发现消息
   this.messageBus.subscribe(MSG_CONTAINER_CHILD_DISCOVERED, (msg: any) => {
     const { containerId } = msg.payload;
     if (containerId && !this.containerStates.has(containerId)) {
       this.containerStates.set(containerId, {
        id: containerId,
        status: ContainerStatus.DISCOVERED,
        operationsCompleted: 0,
       lastUpdateTime: Date.now()
     });
   }
 });

 // 监听操作完成消息
    this.messageBus.subscribe(MSG_CONTAINER_OPERATION_COMPLETE, (msg: any) => {
      const { containerId } = msg.payload;
      const state = this.containerStates.get(containerId);
      if (state) {
        state.operationsCompleted++;
        state.status = ContainerStatus.PROCESSING; // 标记为处理中
        state.lastUpdateTime = Date.now();
        
        // 注意：这里需要知道总操作数才能判断是否完全COMPLETED
        // 暂时假设收到COMPLETE即表示该步骤成功，
        // 实际逻辑可能需要结合 OperationExecutor 的完成通知
      }
    });

    // 监听操作失败消息
    this.messageBus.subscribe(MSG_CONTAINER_OPERATION_FAILED, (msg: any) => {
      const { containerId } = msg.payload;
      const state = this.containerStates.get(containerId);
      if (state) {
        if (state.status !== ContainerStatus.FAILED) {
          state.status = ContainerStatus.FAILED;
          this.totalFailed++;
          this.checkAllComplete();
        }
        state.lastUpdateTime = Date.now();
      }
    });
  }

  /**
   * 标记容器处理完成
   */
  public markContainerCompleted(containerId: string): void {
   const state = this.containerStates.get(containerId);
   if (state && state.status !== ContainerStatus.COMPLETED && state.status !== ContainerStatus.FAILED) {
     state.status = ContainerStatus.COMPLETED;
     this.checkAllComplete();
   }
 }

 private checkAllComplete(): void {
    if (this.totalDiscovered > 0 && 
        (this.totalCompleted + this.totalFailed) === this.totalDiscovered) {
      
      this.messageBus.publish(MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE, {
        total: this.totalDiscovered,
        completed: this.totalCompleted,
        failed: this.totalFailed
      }, { component: 'ContainerStatusTracker' });
    }
  }
}
