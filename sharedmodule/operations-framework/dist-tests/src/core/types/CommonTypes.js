/**
 * WebAuto Operator Framework - 通用类型定义
 * @package @webauto/operator-framework
 */
/**
 * 事件类型枚举
 */
export var EventType;
(function (EventType) {
    EventType["OPERATOR_CREATED"] = "operator.created";
    EventType["OPERATOR_INITIALIZED"] = "operator.initialized";
    EventType["OPERATOR_STARTED"] = "operator.started";
    EventType["OPERATOR_COMPLETED"] = "operator.completed";
    EventType["OPERATOR_ERROR"] = "operator.error";
    EventType["OPERATOR_DESTROYED"] = "operator.destroyed";
    EventType["CONNECTION_ESTABLISHED"] = "connection.established";
    EventType["CONNECTION_CLOSED"] = "connection.closed";
    EventType["CONTEXT_UPDATED"] = "context.updated";
    EventType["STATE_CHANGED"] = "state.changed";
})(EventType || (EventType = {}));
/**
 * 错误类型枚举
 */
export var ErrorType;
(function (ErrorType) {
    ErrorType["INITIALIZATION_ERROR"] = "initialization.error";
    ErrorType["EXECUTION_ERROR"] = "execution.error";
    ErrorType["TIMEOUT_ERROR"] = "timeout.error";
    ErrorType["CONNECTION_ERROR"] = "connection.error";
    ErrorType["VALIDATION_ERROR"] = "validation.error";
    ErrorType["UNKNOWN_ERROR"] = "unknown.error";
})(ErrorType || (ErrorType = {}));
//# sourceMappingURL=CommonTypes.js.map