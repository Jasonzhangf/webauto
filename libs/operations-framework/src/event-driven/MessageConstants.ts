/**
 * 统一消息常量定义
 * 采用 Windows 消息风格的命名规范
 * 格式：MSG_<分类>_<层级>_<对象>_<动作>_<状态>
 * 
 * 消息分类：
 * - SYSTEM:    系统级（启动、关闭、配置）
 * - BROWSER:   浏览器级（会话、页面、导航）
 * - CONTAINER: 容器级（生命周期、状态、操作）
 * - WORKFLOW:  工作流级（任务、步骤、条件）
 * - UI:        UI级（交互、显示、事件）
 * - PROJECT:   项目级（配置、持久化、同步）
 */

// ============================================================================
// 系统级消息 (SYSTEM)
// ============================================================================

/** 系统初始化开始 */
export const MSG_SYSTEM_INIT_START = 'MSG_SYSTEM_INIT_START';
/** 系统初始化完成 */
export const MSG_SYSTEM_INIT_COMPLETE = 'MSG_SYSTEM_INIT_COMPLETE';
/** 系统初始化失败 */
export const MSG_SYSTEM_INIT_FAILED = 'MSG_SYSTEM_INIT_FAILED';

/** 系统关闭开始 */
export const MSG_SYSTEM_SHUTDOWN_START = 'MSG_SYSTEM_SHUTDOWN_START';
/** 系统关闭完成 */
export const MSG_SYSTEM_SHUTDOWN_COMPLETE = 'MSG_SYSTEM_SHUTDOWN_COMPLETE';

/** 系统错误 */
export const MSG_SYSTEM_ERROR = 'MSG_SYSTEM_ERROR';
/** 系统警告 */
export const MSG_SYSTEM_WARNING = 'MSG_SYSTEM_WARNING';
/** 系统信息 */
export const MSG_SYSTEM_INFO = 'MSG_SYSTEM_INFO';

/** 系统配置变更 */
export const MSG_SYSTEM_CONFIG_CHANGED = 'MSG_SYSTEM_CONFIG_CHANGED';
/** 系统状态更新 */
export const MSG_SYSTEM_STATE_UPDATED = 'MSG_SYSTEM_STATE_UPDATED';

// ============================================================================
// 浏览器级消息 (BROWSER)
// ============================================================================

/** 浏览器服务启动 */
export const MSG_BROWSER_SERVICE_START = 'MSG_BROWSER_SERVICE_START';
/** 浏览器服务停止 */
export const MSG_BROWSER_SERVICE_STOP = 'MSG_BROWSER_SERVICE_STOP';
/** 浏览器服务就绪 */
export const MSG_BROWSER_SERVICE_READY = 'MSG_BROWSER_SERVICE_READY';

/** 浏览器会话创建 */
export const MSG_BROWSER_SESSION_CREATE = 'MSG_BROWSER_SESSION_CREATE';
/** 浏览器会话创建完成 */
export const MSG_BROWSER_SESSION_CREATED = 'MSG_BROWSER_SESSION_CREATED';
/** 浏览器会话销毁 */
export const MSG_BROWSER_SESSION_DESTROY = 'MSG_BROWSER_SESSION_DESTROY';
/** 浏览器会话销毁完成 */
export const MSG_BROWSER_SESSION_DESTROYED = 'MSG_BROWSER_SESSION_DESTROYED';

/** 页面加载开始 */
export const MSG_BROWSER_PAGE_LOAD_START = 'MSG_BROWSER_PAGE_LOAD_START';
/** 页面加载完成 */
export const MSG_BROWSER_PAGE_LOAD_COMPLETE = 'MSG_BROWSER_PAGE_LOAD_COMPLETE';
/** 页面加载失败 */
export const MSG_BROWSER_PAGE_LOAD_FAILED = 'MSG_BROWSER_PAGE_LOAD_FAILED';

/** 页面导航开始 */
export const MSG_BROWSER_PAGE_NAVIGATE_START = 'MSG_BROWSER_PAGE_NAVIGATE_START';
/** 页面导航完成 */
export const MSG_BROWSER_PAGE_NAVIGATE_COMPLETE = 'MSG_BROWSER_PAGE_NAVIGATE_COMPLETE';

/** 页面 DOM 就绪 */
export const MSG_BROWSER_PAGE_DOM_READY = 'MSG_BROWSER_PAGE_DOM_READY';
/** 页面完全加载 */
export const MSG_BROWSER_PAGE_FULL_LOADED = 'MSG_BROWSER_PAGE_FULL_LOADED';

/** 页面滚动 */
export const MSG_BROWSER_PAGE_SCROLL = 'MSG_BROWSER_PAGE_SCROLL';
/** 页面点击 */
export const MSG_BROWSER_PAGE_CLICK = 'MSG_BROWSER_PAGE_CLICK';

// ============================================================================
// 容器级消息 (CONTAINER)
// ============================================================================

/** 容器注册 */
export const MSG_CONTAINER_REGISTER = 'MSG_CONTAINER_REGISTER';
/** 容器注册完成 */
export const MSG_CONTAINER_REGISTERED = 'MSG_CONTAINER_REGISTERED';
/** 容器注销 */
export const MSG_CONTAINER_UNREGISTER = 'MSG_CONTAINER_UNREGISTER';

/** 容器创建 */
export const MSG_CONTAINER_CREATE = 'MSG_CONTAINER_CREATE';
/** 容器创建完成 */
export const MSG_CONTAINER_CREATED = 'MSG_CONTAINER_CREATED';
/** 容器初始化 */
export const MSG_CONTAINER_INIT = 'MSG_CONTAINER_INIT';
/** 容器初始化完成 */
export const MSG_CONTAINER_INITIALIZED = 'MSG_CONTAINER_INITIALIZED';

/** 容器启动 */
export const MSG_CONTAINER_START = 'MSG_CONTAINER_START';
/** 容器启动完成 */
export const MSG_CONTAINER_STARTED = 'MSG_CONTAINER_STARTED';
/** 容器停止 */
export const MSG_CONTAINER_STOP = 'MSG_CONTAINER_STOP';
/** 容器停止完成 */
export const MSG_CONTAINER_STOPPED = 'MSG_CONTAINER_STOPPED';

/** 容器销毁 */
export const MSG_CONTAINER_DESTROY = 'MSG_CONTAINER_DESTROY';
/** 容器销毁完成 */
export const MSG_CONTAINER_DESTROYED = 'MSG_CONTAINER_DESTROYED';

/** 容器发现 */
export const MSG_CONTAINER_DISCOVER = 'MSG_CONTAINER_DISCOVER';
/** 容器发现完成 */
export const MSG_CONTAINER_DISCOVERED = 'MSG_CONTAINER_DISCOVERED';
/** 容器出现（appear 事件）*/
export const MSG_CONTAINER_APPEAR = 'MSG_CONTAINER_APPEAR';
/** 容器消失 */
export const MSG_CONTAINER_DISAPPEAR = 'MSG_CONTAINER_DISAPPEAR';

/** 容器匹配开始 */
export const MSG_CONTAINER_MATCH_START = 'MSG_CONTAINER_MATCH_START';
/** 容器匹配成功 */
export const MSG_CONTAINER_MATCH_SUCCESS = 'MSG_CONTAINER_MATCH_SUCCESS';
/** 容器匹配失败 */
export const MSG_CONTAINER_MATCH_FAILED = 'MSG_CONTAINER_MATCH_FAILED';

/** 容器状态变更 */
export const MSG_CONTAINER_STATE_CHANGED = 'MSG_CONTAINER_STATE_CHANGED';
/** 容器就绪 */
export const MSG_CONTAINER_STATE_READY = 'MSG_CONTAINER_STATE_READY';
/** 容器忙碌 */
export const MSG_CONTAINER_STATE_BUSY = 'MSG_CONTAINER_STATE_BUSY';
/** 容器空闲 */
export const MSG_CONTAINER_STATE_IDLE = 'MSG_CONTAINER_STATE_IDLE';
/** 容器错误 */
export const MSG_CONTAINER_STATE_ERROR = 'MSG_CONTAINER_STATE_ERROR';

/** 容器获得焦点 */
export const MSG_CONTAINER_FOCUSED = 'MSG_CONTAINER_FOCUSED';
/** 容器失去焦点 */
export const MSG_CONTAINER_DEFOCUSED = 'MSG_CONTAINER_DEFOCUSED';

/** 容器点击 */
export const MSG_CONTAINER_CLICK = 'MSG_CONTAINER_CLICK';
/** 容器输入 */
export const MSG_CONTAINER_INPUT = 'MSG_CONTAINER_INPUT';
/** 容器变更 */
export const MSG_CONTAINER_CHANGE = 'MSG_CONTAINER_CHANGE';

// 操作执行消息
export const MSG_CONTAINER_OPERATION_START = 'MSG_CONTAINER_OPERATION_START';
export const MSG_CONTAINER_OPERATION_PROGRESS = 'MSG_CONTAINER_OPERATION_PROGRESS';
export const MSG_CONTAINER_OPERATION_COMPLETE = 'MSG_CONTAINER_OPERATION_COMPLETE';
export const MSG_CONTAINER_OPERATION_FAILED = 'MSG_CONTAINER_OPERATION_FAILED';

// 根容器特定消息
/** 根容器滚动开始 */
export const MSG_CONTAINER_ROOT_SCROLL_START = 'MSG_CONTAINER_ROOT_SCROLL_START';
/** 根容器滚动进行中 */
export const MSG_CONTAINER_ROOT_SCROLL_PROGRESS = 'MSG_CONTAINER_ROOT_SCROLL_PROGRESS';
/** 根容器滚动到底 */
export const MSG_CONTAINER_ROOT_SCROLL_BOTTOM = 'MSG_CONTAINER_ROOT_SCROLL_BOTTOM';
/** 根容器滚动停止 */
export const MSG_CONTAINER_ROOT_SCROLL_STOP = 'MSG_CONTAINER_ROOT_SCROLL_STOP';

/** 根容器页面事件 */
export const MSG_CONTAINER_ROOT_PAGE_LOAD = 'MSG_CONTAINER_ROOT_PAGE_LOAD';
export const MSG_CONTAINER_ROOT_PAGE_SCROLL = 'MSG_CONTAINER_ROOT_PAGE_SCROLL';
export const MSG_CONTAINER_ROOT_PAGE_NAVIGATE = 'MSG_CONTAINER_ROOT_PAGE_NAVIGATE';

// 容器变量和状态
/** 容器变量设置 */
export const MSG_CONTAINER_VAR_SET = 'MSG_CONTAINER_VAR_SET';
/** 容器变量获取 */
export const MSG_CONTAINER_VAR_GET = 'MSG_CONTAINER_VAR_GET';
/** 容器变量删除 */
export const MSG_CONTAINER_VAR_DELETE = 'MSG_CONTAINER_VAR_DELETE';
/** 容器变量变更 */
export const MSG_CONTAINER_VAR_CHANGED = 'MSG_CONTAINER_VAR_CHANGED';

// 根容器变量管理
/** 根容器变量设置 */
export const MSG_CONTAINER_ROOT_VAR_SET = 'MSG_CONTAINER_ROOT_VAR_SET';
/** 根容器变量获取 */
export const MSG_CONTAINER_ROOT_VAR_GET = 'MSG_CONTAINER_ROOT_VAR_GET';
/** 根容器变量删除 */
export const MSG_CONTAINER_ROOT_VAR_DELETE = 'MSG_CONTAINER_ROOT_VAR_DELETE';
/** 根容器变量变更 */
export const MSG_CONTAINER_ROOT_VAR_CHANGED = 'MSG_CONTAINER_ROOT_VAR_CHANGED';

// 发现流程消息
/** 根容器开始发现子容器 */
export const MSG_CONTAINER_ROOT_DISCOVER_START = 'MSG_CONTAINER_ROOT_DISCOVER_START';
/** 根容器发现进度 */
export const MSG_CONTAINER_ROOT_DISCOVER_PROGRESS = 'MSG_CONTAINER_ROOT_DISCOVER_PROGRESS';
/** 根容器发现完成 */
export const MSG_CONTAINER_ROOT_DISCOVER_COMPLETE = 'MSG_CONTAINER_ROOT_DISCOVER_COMPLETE';
/** 子容器被发现 */
export const MSG_CONTAINER_CHILD_DISCOVERED = 'MSG_CONTAINER_CHILD_DISCOVERED';
/** 子容器注册完成 */
export const MSG_CONTAINER_CHILD_REGISTERED = 'MSG_CONTAINER_CHILD_REGISTERED';
/** 子容器移除 */
export const MSG_CONTAINER_CHILD_REMOVED = 'MSG_CONTAINER_CHILD_REMOVED';

// 操作批量执行状态
/** 批量操作完成 */
export const MSG_CONTAINER_ROOT_OPERATIONS_BATCH_COMPLETE = 'MSG_CONTAINER_ROOT_OPERATIONS_BATCH_COMPLETE';
/** 所有子容器操作完成 */
export const MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE = 'MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE';

// 根容器滚动完成
/** 根容器滚动完成 */
export const MSG_CONTAINER_ROOT_SCROLL_COMPLETE = 'MSG_CONTAINER_ROOT_SCROLL_COMPLETE';

// ============================================================================
// 工作流级消息 (WORKFLOW)
// ============================================================================

/** 工作流启动 */
export const MSG_WORKFLOW_START = 'MSG_WORKFLOW_START';
/** 工作流启动完成 */
export const MSG_WORKFLOW_STARTED = 'MSG_WORKFLOW_STARTED';
/** 工作流完成 */
export const MSG_WORKFLOW_COMPLETE = 'MSG_WORKFLOW_COMPLETE';
/** 工作流失败 */
export const MSG_WORKFLOW_FAILED = 'MSG_WORKFLOW_FAILED';
/** 工作流暂停 */
export const MSG_WORKFLOW_PAUSE = 'MSG_WORKFLOW_PAUSE';
/** 工作流恢复 */
export const MSG_WORKFLOW_RESUME = 'MSG_WORKFLOW_RESUME';
/** 工作流取消 */
export const MSG_WORKFLOW_CANCEL = 'MSG_WORKFLOW_CANCEL';

/** 工作流步骤开始 */
export const MSG_WORKFLOW_STEP_START = 'MSG_WORKFLOW_STEP_START';
/** 工作流步骤完成 */
export const MSG_WORKFLOW_STEP_COMPLETE = 'MSG_WORKFLOW_STEP_COMPLETE';
/** 工作流步骤失败 */
export const MSG_WORKFLOW_STEP_FAILED = 'MSG_WORKFLOW_STEP_FAILED';
/** 工作流步骤跳过 */
export const MSG_WORKFLOW_STEP_SKIPPED = 'MSG_WORKFLOW_STEP_SKIPPED';

/** 工作流任务就绪 */
export const MSG_WORKFLOW_TASK_READY = 'MSG_WORKFLOW_TASK_READY';
/** 工作流任务开始 */
export const MSG_WORKFLOW_TASK_START = 'MSG_WORKFLOW_TASK_START';
/** 工作流任务完成 */
export const MSG_WORKFLOW_TASK_COMPLETE = 'MSG_WORKFLOW_TASK_COMPLETE';
/** 工作流任务失败 */
export const MSG_WORKFLOW_TASK_FAILED = 'MSG_WORKFLOW_TASK_FAILED';

/** 工作流条件满足 */
export const MSG_WORKFLOW_CONDITION_MET = 'MSG_WORKFLOW_CONDITION_MET';
/** 工作流条件未满足 */
export const MSG_WORKFLOW_CONDITION_UNMET = 'MSG_WORKFLOW_CONDITION_UNMET';
/** 工作流规则评估 */
export const MSG_WORKFLOW_RULE_EVALUATED = 'MSG_WORKFLOW_RULE_EVALUATED';

/** 工作流状态变更 */
export const MSG_WORKFLOW_STATE_CHANGED = 'MSG_WORKFLOW_STATE_CHANGED';

// ============================================================================
// UI级消息 (UI)
// ============================================================================

/** UI 高亮元素 */
export const MSG_UI_HIGHLIGHT_ELEMENT = 'MSG_UI_HIGHLIGHT_ELEMENT';
/** UI 高亮 DOM 路径 */
export const MSG_UI_HIGHLIGHT_DOM_PATH = 'MSG_UI_HIGHLIGHT_DOM_PATH';
/** UI 清除高亮 */
export const MSG_UI_CLEAR_HIGHLIGHT = 'MSG_UI_CLEAR_HIGHLIGHT';

/** UI 拾取 DOM 开始 */
export const MSG_UI_PICK_DOM_START = 'MSG_UI_PICK_DOM_START';
/** UI 拾取 DOM 完成 */
export const MSG_UI_PICK_DOM_COMPLETE = 'MSG_UI_PICK_DOM_COMPLETE';
/** UI 拾取 DOM 取消 */
export const MSG_UI_PICK_DOM_CANCEL = 'MSG_UI_PICK_DOM_CANCEL';

/** UI 面板显示 */
export const MSG_UI_PANEL_SHOW = 'MSG_UI_PANEL_SHOW';
/** UI 面板隐藏 */
export const MSG_UI_PANEL_HIDE = 'MSG_UI_PANEL_HIDE';
/** UI 面板切换 */
export const MSG_UI_PANEL_TOGGLE = 'MSG_UI_PANEL_TOGGLE';

/** UI 容器选中 */
export const MSG_UI_CONTAINER_SELECT = 'MSG_UI_CONTAINER_SELECT';
/** UI 容器取消选中 */
export const MSG_UI_CONTAINER_DESELECT = 'MSG_UI_CONTAINER_DESELECT';

/** UI 操作执行 */
export const MSG_UI_ACTION_EXECUTE = 'MSG_UI_ACTION_EXECUTE';
/** UI 操作完成 */
export const MSG_UI_ACTION_COMPLETE = 'MSG_UI_ACTION_COMPLETE';
/** UI 操作失败 */
export const MSG_UI_ACTION_FAILED = 'MSG_UI_ACTION_FAILED';

/** UI 通知显示 */
export const MSG_UI_NOTIFY_SHOW = 'MSG_UI_NOTIFY_SHOW';
/** UI 通知隐藏 */
export const MSG_UI_NOTIFY_HIDE = 'MSG_UI_NOTIFY_HIDE';

// ============================================================================
// 项目级消息 (PROJECT)
// ============================================================================

/** 项目初始化 */
export const MSG_PROJECT_INIT = 'MSG_PROJECT_INIT';
/** 项目初始化完成 */
export const MSG_PROJECT_INITIALIZED = 'MSG_PROJECT_INITIALIZED';

/** 项目配置加载 */
export const MSG_PROJECT_CONFIG_LOAD = 'MSG_PROJECT_CONFIG_LOAD';
/** 项目配置加载完成 */
export const MSG_PROJECT_CONFIG_LOADED = 'MSG_PROJECT_CONFIG_LOADED';
/** 项目配置保存 */
export const MSG_PROJECT_CONFIG_SAVE = 'MSG_PROJECT_CONFIG_SAVE';
/** 项目配置保存完成 */
export const MSG_PROJECT_CONFIG_SAVED = 'MSG_PROJECT_CONFIG_SAVED';
/** 项目配置变更 */
export const MSG_PROJECT_CONFIG_CHANGED = 'MSG_PROJECT_CONFIG_CHANGED';

/** 项目持久化开始 */
export const MSG_PROJECT_PERSIST_START = 'MSG_PROJECT_PERSIST_START';
/** 项目持久化完成 */
export const MSG_PROJECT_PERSIST_COMPLETE = 'MSG_PROJECT_PERSIST_COMPLETE';
/** 项目持久化失败 */
export const MSG_PROJECT_PERSIST_FAILED = 'MSG_PROJECT_PERSIST_FAILED';

/** 项目同步开始 */
export const MSG_PROJECT_SYNC_START = 'MSG_PROJECT_SYNC_START';
/** 项目同步完成 */
export const MSG_PROJECT_SYNC_COMPLETE = 'MSG_PROJECT_SYNC_COMPLETE';

// ============================================================================
// 消息分组（便于管理和订阅）
// ============================================================================

/** 系统级消息通配符 */
export const MSG_SYSTEM_ALL = 'MSG_SYSTEM_*';
/** 浏览器级消息通配符 */
export const MSG_BROWSER_ALL = 'MSG_BROWSER_*';
/** 容器级消息通配符 */
export const MSG_CONTAINER_ALL = 'MSG_CONTAINER_*';
/** 工作流级消息通配符 */
export const MSG_WORKFLOW_ALL = 'MSG_WORKFLOW_*';
/** UI级消息通配符 */
export const MSG_UI_ALL = 'MSG_UI_*';
/** 项目级消息通配符 */
export const MSG_PROJECT_ALL = 'MSG_PROJECT_*';

/** 所有消息通配符 */
export const MSG_ALL = 'MSG_*';

// ============================================================================
// 浏览器控制指令 (BROWSER COMMANDS - RPC)
// 用于通过消息总线远程控制浏览器行为
// ============================================================================

/** DOM 查询请求 */
export const CMD_BROWSER_DOM_QUERY = 'CMD_BROWSER_DOM_QUERY';
/** DOM 查询响应 */
export const RES_BROWSER_DOM_QUERY = 'RES_BROWSER_DOM_QUERY';

/** DOM 操作请求 (Click, Input, Focus etc) */
export const CMD_BROWSER_DOM_ACTION = 'CMD_BROWSER_DOM_ACTION';
/** DOM 操作响应 */
export const RES_BROWSER_DOM_ACTION = 'RES_BROWSER_DOM_ACTION';

/** 页面滚动请求 */
export const CMD_BROWSER_PAGE_SCROLL = 'CMD_BROWSER_PAGE_SCROLL';
/** 页面滚动响应 */
export const RES_BROWSER_PAGE_SCROLL = 'RES_BROWSER_PAGE_SCROLL';

/** 页面导航请求 */
export const CMD_BROWSER_PAGE_NAVIGATE = 'CMD_BROWSER_PAGE_NAVIGATE';
/** 页面导航响应 */
export const RES_BROWSER_PAGE_NAVIGATE = 'RES_BROWSER_PAGE_NAVIGATE';

/** 截图请求 */
export const CMD_BROWSER_SNAPSHOT = 'CMD_BROWSER_SNAPSHOT';
/** 截图响应 */
export const RES_BROWSER_SNAPSHOT = 'RES_BROWSER_SNAPSHOT';

/** 脚本执行请求 */
export const CMD_BROWSER_EVALUATE = 'CMD_BROWSER_EVALUATE';
/** 脚本执行响应 */
export const RES_BROWSER_EVALUATE = 'RES_BROWSER_EVALUATE';
