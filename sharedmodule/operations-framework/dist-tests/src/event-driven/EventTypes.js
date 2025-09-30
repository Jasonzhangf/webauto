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
//# sourceMappingURL=EventTypes.js.map