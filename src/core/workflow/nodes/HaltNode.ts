// 停止节点（失败并中止，不清理资源）
import BaseNode from './BaseNode';

class HaltNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'HaltNode';
    this.description = '以失败状态中止工作流（不清理资源）';
  }
    name: any;

  async execute(context: any, params: any): Promise<any> {
    const { config, logger } = context;
    const msg = config?.message || 'Halted by HaltNode';
    logger.error(`🛑 ${msg}`);
    return {
      success: false,
      error: msg
    };
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        message: { type: 'string', description: '停止原因' }
      },
      required: []
    };
  }
}

export default HaltNode;

