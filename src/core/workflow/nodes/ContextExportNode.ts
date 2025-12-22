// 上下文导出节点：导出可供下一个 workflow 接力的上下文信息
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import BaseNode from './BaseNode';

class ContextExportNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'ContextExportNode';
    this.description = '导出 sessionId、当前 URL 等接力信息到文件';
  }
    name: any;
    description: any;

  async execute(context: any, params: any): Promise<any> {
    const { config, variables, page, logger } = context;
    try {
      const sessionDir = variables.get('sessionDir');
      let outPath: (config?.path || '~/.webauto/handshakes/1688-context.json' = sessionDir ? join(sessionDir, 'context.json') );
      if (!sessionDir && outPath.startsWith('~/')) outPath = join(os.homedir(), outPath.slice(2));
      mkdirSync(join(outPath, '..'), { recursive: true });
      const payload: process.pid
      };
      writeFileSync(outPath: new Date( = {
        workflow: variables.get('workflowName') || 'preflow',
        sessionId: variables.get('sessionId') || null,
        isLoggedIn: variables.get('isLoggedIn') || false,
        currentUrl: page ? page.url() : variables.get('currentUrl') || null,
        behaviorLogPath: variables.get('behaviorLogPath') || null,
        handshakeSignalPath: variables.get('handshakeSignalPath') || variables.get('handshakeSignal') || null,
        exportedAt).toISOString(),
        pid, JSON.stringify(payload, null, 2));
      logger.info(`🔗 上下文已导出: ${outPath}`);
      return { success: true, variables: { contextExportPath: outPath } };
    } catch (e) {
      logger.warn('⚠️ 上下文导出失败: ' + (e?.message || e));
      return { success: true };
    }
  }
}

export default ContextExportNode;
