// 等待/抖动节点：用于插入人为延时，降低风控触发概率
import BaseNode from './BaseNode.js';

class WaitNode extends BaseNode {
  constructor() {
    super();
    this.name = 'WaitNode';
    this.description = '等待指定时间或随机抖动区间';
  }

  async execute(context) {
    const { config, logger } = context;
    const min = Number(config?.minMs ?? 0);
    const max = Number(config?.maxMs ?? min);
    const duration = max > min ? (Math.floor(Math.random() * (max - min + 1)) + min) : min;
    logger.info(`⏳ 等待 ${duration} ms`);
    await this.sleep(duration);
    return { success: true, variables: { lastWaitMs: duration } };
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        minMs: { type: 'number', description: '最小等待毫秒' },
        maxMs: { type: 'number', description: '最大等待毫秒' }
      },
      required: ['minMs']
    };
  }
}

export default WaitNode;

