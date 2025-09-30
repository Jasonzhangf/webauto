/**
 * 事件类型常量定义
 * 提供统一的事件类型管理和使用
 */

export const CONTAINER_EVENTS = {
  // 生命周期事件
  LIFECYCLE: {
    CREATED: 'container:created',
    INITIALIZED: 'container:initialized',
    STARTED: 'container:started',
    COMPLETED: 'container:completed',
    FAILED: 'container:failed',
    DESTROYED: 'container:destroyed'
  },

  // 状态变化事件
  STATE: {
    CHANGED: 'container:state:changed',
    READY: 'container:state:ready',
    BUSY: 'container:state:busy',
    IDLE: 'container:state:idle',
    ERROR: 'container:state:error'
  },

  // 滚动事件
  SCROLL: {
    STARTED: 'scroll:started',
    PROGRESS: 'scroll:progress',
    BOTTOM_REACHED: 'scroll:bottom_reached',
    NO_NEW_CONTENT: 'scroll:no_new_content',
    STOPPED: 'scroll:stopped',
    ERROR: 'scroll:error',
    STEP_COMPLETED: 'scroll:step_completed'
  },

  // 分页事件
  PAGINATION: {
    STARTED: 'pagination:started',
    PAGE_LOADED: 'pagination:page_loaded',
    LAST_PAGE_REACHED: 'pagination:last_page_reached',
    NO_NEW_PAGES: 'pagination:no_new_pages',
    STOPPED: 'pagination:stopped',
    ERROR: 'pagination:error',
    BUTTON_CLICKED: 'pagination:button_clicked'
  },

  // 链接发现事件
  LINKS: {
    DISCOVERED: 'links:discovered',
    BATCH_DISCOVERED: 'links:batch_discovered',
    FILTERED: 'links:filtered',
    DUPLICATE_FOUND: 'links:duplicate_found',
    TARGET_REACHED: 'links:target_reached',
    EXTRACTION_COMPLETED: 'links:extraction_completed'
  },

  // 内容变化事件
  CONTENT: {
    MUTATION_DETECTED: 'content:mutation_detected',
    NEW_CONTENT_LOADED: 'content:new_content_loaded',
    CONTENT_STABILIZED: 'content:stabilized',
    DOM_UPDATED: 'content:dom_updated'
  },

  // 工作流编排事件
  WORKFLOW: {
    TASK_READY: 'workflow:task_ready',
    TASK_STARTED: 'workflow:task_started',
    TASK_COMPLETED: 'workflow:task_completed',
    TASK_FAILED: 'workflow:task_failed',
    CONDITION_MET: 'workflow:condition_met',
    RULE_EVALUATED: 'workflow:rule_evaluated',
    WORKFLOW_STARTED: 'workflow:started',
    WORKFLOW_COMPLETED: 'workflow:completed'
  },

  // 页面事件
  PAGE: {
    LOADED: 'page:loaded',
    NAVIGATION_COMPLETED: 'page:navigation_completed',
    ERROR: 'page:error',
    READY: 'page:ready',
    UNLOAD: 'page:unload'
  },

  // 系统事件
  SYSTEM: {
    INITIALIZATION_STARTED: 'system:initialization_started',
    INITIALIZATION_COMPLETED: 'system:initialization_completed',
    SHUTDOWN_STARTED: 'system:shutdown_started',
    SHUTDOWN_COMPLETED: 'system:shutdown_completed',
    ERROR: 'system:error',
    WARNING: 'system:warning'
  }
};

// 事件组类型
export type EventGroup = keyof typeof CONTAINER_EVENTS;

// 事件类型映射
export interface EventDataMap {
  // 生命周期事件数据
  'container:created': { containerId: string; containerType: string; timestamp: number };
  'container:initialized': { containerId: string; initializationTime: number };
  'container:started': { containerId: string; startTime: number };
  'container:completed': { containerId: string; result: any; executionTime: number };
  'container:failed': { containerId: string; error: string; executionTime: number };
  'container:destroyed': { containerId: string; cleanupTime: number };

  // 状态事件数据
  'container:state:changed': { containerId: string; fromState: string; toState: string };
  'container:state:ready': { containerId: string };
  'container:state:busy': { containerId: string; reason: string };
  'container:state:idle': { containerId: string };
  'container:state:error': { containerId: string; error: string };

  // 滚动事件数据
  'scroll:started': { containerId: string; startTime: number };
  'scroll:progress': {
    containerId: string;
    scrollCount: number;
    scrollHeight: number;
    scrollTop: number;
    newContentFound: boolean;
  };
  'scroll:bottom_reached': {
    containerId: string;
    totalScrollHeight: number;
    scrollTime: number;
  };
  'scroll:no_new_content': {
    containerId: string;
    consecutiveCount: number;
    lastContentTime: number;
  };
  'scroll:stopped': { containerId: string; reason: string; totalScrolls: number };
  'scroll:error': { containerId: string; error: string; scrollCount: number };
  'scroll:step_completed': { containerId: string; step: number; success: boolean };

  // 分页事件数据
  'pagination:started': { containerId: string; startTime: number };
  'pagination:page_loaded': {
    containerId: string;
    pageNumber: number;
    url: string;
    isLastPage: boolean;
  };
  'pagination:last_page_reached': { containerId: string; lastPageNumber: number };
  'pagination:no_new_pages': {
    containerId: string;
    consecutiveCount: number;
    lastPageNumber: number;
  };
  'pagination:stopped': { containerId: string; reason: string; totalPages: number };
  'pagination:error': { containerId: string; error: string; currentPage: number };
  'pagination:button_clicked': { containerId: string; buttonType: string; success: boolean };

  // 链接事件数据
  'links:discovered': {
    containerId: string;
    links: Array<{ href: string; text: string; type: string }>;
  };
  'links:batch_discovered': {
    containerId: string;
    links: Array<{ href: string; text: string; type: string }>;
    totalCount: number;
    newLinks: number;
  };
  'links:filtered': { containerId: string; originalCount: number; filteredCount: number };
  'links:duplicate_found': { containerId: string; duplicateLink: string; existingLink: string };
  'links:target_reached': { targetCount: number; actualCount: number };
  'links:extraction_completed': { containerId: string; totalLinks: number; extractionTime: number };

  // 内容事件数据
  'content:mutation_detected': { containerId: string; mutationType: string; targetSelector: string };
  'content:new_content_loaded': { containerId: string; contentSize: number; loadTime: number };
  'content:stabilized': { containerId: string; stabilizationTime: number };
  'content:dom_updated': { containerId: string; changedNodes: number };

  // 工作流事件数据
  'workflow:task_ready': { taskId: string; taskName: string; priority: number };
  'workflow:task_started': { taskId: string; startTime: number };
  'workflow:task_completed': { taskId: string; result: any; executionTime: number };
  'workflow:task_failed': { taskId: string; error: string; executionTime: number };
  'workflow:condition_met': { ruleName: string; eventData: any };
  'workflow:rule_evaluated': { ruleName: string; condition: boolean; action: string };
  'workflow:started': { workflowId: string; startTime: number };
  'workflow:completed': { workflowId: string; result: any; executionTime: number };

  // 页面事件数据
  'page:loaded': { url: string; loadTime: number; title: string };
  'page:navigation_completed': { fromUrl: string; toUrl: string; navigationTime: number };
  'page:error': { url: string; error: string; errorType: string };
  'page:ready': { url: string; readyTime: number };
  'page:unload': { url: string; unloadTime: number };

  // 系统事件数据
  'system:initialization_started': { timestamp: number };
  'system:initialization_completed': { initializationTime: number; componentCount: number };
  'system:shutdown_started': { timestamp: number };
  'system:shutdown_completed': { shutdownTime: number };
  'system:error': { error: string; errorType: string; timestamp: number };
  'system:warning': { warning: string; warningType: string; timestamp: number };
}

// 事件类型联合
export type EventType = keyof EventDataMap;

// 事件数据类型
export type EventData<T extends EventType> = EventDataMap[T];

// 事件处理器类型
export type EventHandler<T extends EventType = EventType> = (data: EventData<T>) => void | Promise<void>;

// 事件监听器配置
export interface EventListenerConfig<T extends EventType = EventType> {
  event: T;
  handler: EventHandler<T>;
  once?: boolean;
  priority?: number;
}

// 事件过滤器
export interface EventFilter {
  eventType?: EventType | EventType[];
  source?: string;
  dataFilter?: (data: any) => boolean;
  timeRange?: { start: number; end: number };
}

// 事件订阅器
export interface EventSubscription {
  id: string;
  event: EventType;
  handler: EventHandler;
  config: EventListenerConfig;
  unsubscribe: () => void;
}

// 事件流处理器
export interface EventStreamProcessor {
  process(events: EventHistoryEntry[]): Promise<void>;
  filter?: EventFilter;
  bufferSize?: number;
  flushInterval?: number;
}

// 事件历史条目
export interface EventHistoryEntry {
  event: EventType;
  data: EventData<EventType>;
  timestamp: number;
  source?: string;
  id?: string;
}

// 导出常用事件类型
export type LifecycleEvent = EventDataMap['container:created'] | EventDataMap['container:initialized'] | EventDataMap['container:started'] | EventDataMap['container:completed'] | EventDataMap['container:failed'] | EventDataMap['container:destroyed'];
export type StateEvent = EventDataMap['container:state:changed'] | EventDataMap['container:state:ready'] | EventDataMap['container:state:busy'] | EventDataMap['container:state:idle'] | EventDataMap['container:state:error'];
export type ScrollEvent = EventDataMap['scroll:started'] | EventDataMap['scroll:progress'] | EventDataMap['scroll:bottom_reached'] | EventDataMap['scroll:no_new_content'] | EventDataMap['scroll:stopped'] | EventDataMap['scroll:error'] | EventDataMap['scroll:step_completed'];
export type PaginationEvent = EventDataMap['pagination:started'] | EventDataMap['pagination:page_loaded'] | EventDataMap['pagination:last_page_reached'] | EventDataMap['pagination:no_new_pages'] | EventDataMap['pagination:stopped'] | EventDataMap['pagination:error'] | EventDataMap['pagination:button_clicked'];
export type LinksEvent = EventDataMap['links:discovered'] | EventDataMap['links:batch_discovered'] | EventDataMap['links:filtered'] | EventDataMap['links:duplicate_found'] | EventDataMap['links:target_reached'] | EventDataMap['links:extraction_completed'];
export type ContentEvent = EventDataMap['content:mutation_detected'] | EventDataMap['content:new_content_loaded'] | EventDataMap['content:stabilized'] | EventDataMap['content:dom_updated'];
export type WorkflowEvent = EventDataMap['workflow:task_ready'] | EventDataMap['workflow:task_started'] | EventDataMap['workflow:task_completed'] | EventDataMap['workflow:task_failed'] | EventDataMap['workflow:condition_met'] | EventDataMap['workflow:rule_evaluated'] | EventDataMap['workflow:started'] | EventDataMap['workflow:completed'];
export type PageEvent = EventDataMap['page:loaded'] | EventDataMap['page:navigation_completed'] | EventDataMap['page:error'] | EventDataMap['page:ready'] | EventDataMap['page:unload'];
export type SystemEvent = EventDataMap['system:initialization_started'] | EventDataMap['system:initialization_completed'] | EventDataMap['system:shutdown_started'] | EventDataMap['system:shutdown_completed'] | EventDataMap['system:error'] | EventDataMap['system:warning'];