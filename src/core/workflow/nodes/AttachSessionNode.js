// 附着已有会话（使本工作流复用前置流程留下的浏览器上下文）
import BaseNode from './BaseNode.js';

class AttachSessionNode extends BaseNode {
  constructor() {
    super();
    this.name = 'AttachSessionNode';
    this.description = '根据 sessionId 附着已有浏览器会话（browser/context/page）';
  }

  async execute(context) {
    const { config, variables, logger, engine } = context;
    const sessionId = config?.sessionId || variables.get('sessionId');
    if (!sessionId) {
      logger.error('❌ 未提供 sessionId');
      return { success: false, error: 'missing sessionId' };
    }
    const ok = engine.attachSession(sessionId);
    if (!ok) {
      logger.error(`❌ 会话不存在: ${sessionId}`);
      return { success: false, error: 'session not found' };
    }
    logger.info(`🔗 已附着会话: ${sessionId}`);
    return { success: true, variables: { sessionId, sessionAttached: true } };
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '会话ID（可省略，默认使用变量中的 sessionId）' }
      },
      required: []
    };
  }
}

export default AttachSessionNode;

