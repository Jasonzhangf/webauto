/**
 * WebAuto Operator Framework - 工作流类型定义
 * @package @webauto/operator-framework
 */
/**
 * 工作流步骤类型
 */
export var WorkflowStepType;
(function (WorkflowStepType) {
    WorkflowStepType["OPERATOR"] = "operator";
    WorkflowStepType["CONDITION"] = "condition";
    WorkflowStepType["LOOP"] = "loop";
    WorkflowStepType["PARALLEL"] = "parallel";
    WorkflowStepType["DELAY"] = "delay";
    WorkflowStepType["ERROR_HANDLER"] = "error_handler";
})(WorkflowStepType || (WorkflowStepType = {}));
/**
 * 工作流状态枚举
 */
export var WorkflowState;
(function (WorkflowState) {
    WorkflowState["IDLE"] = "idle";
    WorkflowState["RUNNING"] = "running";
    WorkflowState["PAUSED"] = "paused";
    WorkflowState["COMPLETED"] = "completed";
    WorkflowState["ERROR"] = "error";
    WorkflowState["STOPPED"] = "stopped";
})(WorkflowState || (WorkflowState = {}));
/**
 * 工作流事件枚举
 */
export var WorkflowEventType;
(function (WorkflowEventType) {
    WorkflowEventType["WORKFLOW_STARTED"] = "workflow.started";
    WorkflowEventType["WORKFLOW_COMPLETED"] = "workflow.completed";
    WorkflowEventType["WORKFLOW_ERROR"] = "workflow.error";
    WorkflowEventType["WORKFLOW_STOPPED"] = "workflow.stopped";
    WorkflowEventType["WORKFLOW_PAUSED"] = "workflow.paused";
    WorkflowEventType["WORKFLOW_RESUMED"] = "workflow.resumed";
    WorkflowEventType["STEP_STARTED"] = "step.started";
    WorkflowEventType["STEP_COMPLETED"] = "step.completed";
    WorkflowEventType["STEP_ERROR"] = "step.error";
    WorkflowEventType["STEP_RETRY"] = "step.retry";
    WorkflowEventType["CONDITION_EVALUATED"] = "condition.evaluated";
})(WorkflowEventType || (WorkflowEventType = {}));
//# sourceMappingURL=WorkflowTypes.js.map