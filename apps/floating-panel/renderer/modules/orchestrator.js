// 轻量级编排层：连接 UI 模块与消息总线，无 UI 依赖。
export function createOrchestrator({ bus, services = {}, actions = {} }) {
  const { highlight, dom } = services;
  const { highlightActions, domActions } = actions;
  let destroyed = false;

  // 聚动事件总线监听
  function init() {
    if (destroyed) return;
  }

  function destroy() {
    destroyed = true;
  }

  return {
    init,
    destroy,
  };
}
