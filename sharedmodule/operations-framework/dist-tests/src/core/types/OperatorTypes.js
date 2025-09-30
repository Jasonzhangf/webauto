"use strict";
/**
 * WebAuto Operator Framework - 基础类型定义
 * @package @webauto/operator-framework
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperatorState = exports.OperatorCategory = exports.OperatorType = void 0;
/**
 * 操作子类型枚举
 */
var OperatorType;
(function (OperatorType) {
    OperatorType["PAGE_BASED"] = "page-based";
    OperatorType["NON_PAGE"] = "non-page";
    OperatorType["COMPOSITE"] = "composite";
})(OperatorType || (exports.OperatorType = OperatorType = {}));
/**
 * 操作子类别枚举
 */
var OperatorCategory;
(function (OperatorCategory) {
    OperatorCategory["BROWSER"] = "browser";
    OperatorCategory["CONTROL"] = "control";
    OperatorCategory["FILE"] = "file";
    OperatorCategory["NETWORK"] = "network";
    OperatorCategory["DATA"] = "data";
    OperatorCategory["AI"] = "ai";
})(OperatorCategory || (exports.OperatorCategory = OperatorCategory = {}));
/**
 * 操作子状态枚举
 */
var OperatorState;
(function (OperatorState) {
    OperatorState["IDLE"] = "idle";
    OperatorState["RUNNING"] = "running";
    OperatorState["COMPLETED"] = "completed";
    OperatorState["ERROR"] = "error";
    OperatorState["PAUSED"] = "paused";
})(OperatorState || (exports.OperatorState = OperatorState = {}));
