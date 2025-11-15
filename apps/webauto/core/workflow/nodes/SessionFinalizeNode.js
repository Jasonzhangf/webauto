// 会话终结节点：根据 debug/配置决定是否关闭浏览器与销毁会话目录
import BaseNode from './BaseNode.js';
import SessionFS from '../SessionFS.js';
import SessionRegistry from '../SessionRegistry.js';

class SessionFinalizeNode extends BaseNode {
  constructor() {
    super();
    this.name = 'SessionFinalizeNode';
    this.description = '关闭浏览器并销毁会话（非 debug 模式）';
  }

  async execute(context) {
    const { config, logger, variables, engine, browser } = context;
    try {
      const debug = Boolean(variables.get('debug')) || Boolean(process.env.WORKFLOW_DEBUG);
      const destroy = config?.destroy !== false; // 默认销毁
      const closeBrowser = config?.closeBrowser !== false; // 默认关闭
      const sessionId = variables.get('sessionId');

      if (closeBrowser && browser) {
        try { await browser.close(); variables.set('browserClosed', true); logger.info('🧹 已关闭浏览器'); } catch {}
      }

      // 从注册表移除
      if (sessionId) {
        try { await SessionRegistry.close(sessionId); } catch {}
      }

      if (destroy && !debug && sessionId) {
        try { SessionFS.destroySessionDir(sessionId); logger.info('🗑️ 已销毁会话目录'); } catch {}
      } else {
        logger.info('📦 会话目录保留（debug 或 destroy=false）');
      }

      return { success: true, variables: { sessionFinalized: true } };
    } catch (e) {
      logger.warn('⚠️ 会话终结失败: ' + (e?.message || e));
      return { success: true };
    }
  }
}

export default SessionFinalizeNode;

