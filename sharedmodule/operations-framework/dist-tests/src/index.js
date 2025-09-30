/**
 * WebAuto Operator Framework - 核心模块入口
 * @package @webauto/operator-framework
 */
// 核心基类
export { UniversalOperator } from './core/UniversalOperator';
export { PageBasedOperator } from './core/PageBasedOperator';
export { NonPageOperator } from './core/NonPageOperator';
// 类型定义
export * from './core/types/OperatorTypes';
// 版本信息
export const FRAMEWORK_VERSION = '0.0.1';
export const FRAMEWORK_NAME = 'WebAuto Operator Framework';
// 便利函数
export const createOperatorConfig = (config) => config;
export const isPageBasedOperator = (operator) => {
    return operator && typeof operator.getPage === 'function';
};
export const isNonPageOperator = (operator) => {
    return operator && typeof operator.executeAsync === 'function';
};
//# sourceMappingURL=index.js.map