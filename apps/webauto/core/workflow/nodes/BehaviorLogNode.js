// 行为日志输出节点：将引擎收集的行为日志写入文件
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import BaseNode from './BaseNode.js';

class BehaviorLogNode extends BaseNode {
  constructor() {
    super();
    this.name = 'BehaviorLogNode';
    this.description = '将行为事件日志写入指定路径';
  }

  async execute(context) {
    const { engine, config, logger, variables } = context;
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const sessionDir = variables.get('sessionDir');
      let outDir = sessionDir || (config?.outputDir || 'archive/workflow-records');
      if (outDir.startsWith('~/')) outDir = join(os.homedir(), outDir.slice(2));
      const filename = config?.filename || `behavior-${variables.get('workflowName') || 'workflow'}-${ts}.json`;
      const fp = join(outDir, filename);
      mkdirSync(outDir, { recursive: true });
      let data = engine?.getBehaviorLog?.() || [];
      // 如果有 recorder，优先从 recorder 导出，保证包含 page 事件
      if (engine?.recorder?.flush) {
        engine.recorder.flush(fp);
        data = engine?.recorder?.get?.() || data;
      } else {
        writeFileSync(fp, JSON.stringify(data, null, 2));
      }
      logger.info(`📝 行为日志已写入: ${fp} (${data.length} 条)`);
      return { success: true, variables: { behaviorLogPath: fp, behaviorEventCount: data.length } };
    } catch (e) {
      logger.warn('⚠️ 行为日志写入失败: ' + (e?.message || e));
      return { success: true };
    }
  }
}

export default BehaviorLogNode;
