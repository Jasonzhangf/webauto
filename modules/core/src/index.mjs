/**
 * Core 模块入口
 * 导出状态总线、配置中心、错误处理、健康检查、状态广播
 */

export { getStateBus, StateBus } from './state-bus.mjs';
export { getConfigCenter, ConfigCenter } from './config-center.mjs';
export { getErrorHandler, ErrorHandler } from './error-handler.mjs';
export { unifiedHealthCheck } from './health-check.mjs';
export { getStateBroadcaster, StateBroadcaster } from './state-broadcaster.mjs';

// 便捷组合
export async function initCore() {
  const [bus, config, err] = await Promise.all([
    import('./state-bus.mjs').then(m => m.getStateBus()),
    import('./config-center.mjs').then(m => m.getConfigCenter()),
    import('./error-handler.mjs').then(m => m.getErrorHandler())
  ]);
  return { bus, config, err };
}
