// 握手信号节点：在指定路径写入一个简明的状态文件，供外部流程检测
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import os from 'node:os';
import BaseNode from './BaseNode.js';

class HandshakeSignalNode extends BaseNode {
  constructor() {
    super();
    this.name = 'HandshakeSignalNode';
    this.description = '写入握手信号文件（success/failed + sessionId 等）';
  }

  async execute(context) {
    const { config, variables, logger } = context;
    try {
      const sessionDir = variables.get('sessionDir');
      let outPath = sessionDir ? join(sessionDir, 'login.json') : (config?.path || '~/.webauto/handshakes/1688-login.json');
      if (outPath.startsWith('~/')) outPath = join(os.homedir(), outPath.slice(2));
      const payload = {
        workflow: variables.get('workflowName') || '1688-login-preflow',
        status: config?.status || 'unknown',
        sessionId: variables.get('sessionId') || null,
        isLoggedIn: variables.get('isLoggedIn') || false,
        loginInfo: variables.get('loginInfo') || null,
        startedAt: variables.get('startTime') || null,
        finishedAt: new Date().toISOString(),
        pid: process.pid
      };
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(payload, null, 2));
      logger.info(`📣 写入握手信号: ${outPath} (${payload.status})`);
      return { success: true, variables: { handshakeSignalPath: outPath } };
    } catch (e) {
      logger.warn('⚠️ 握手信号写入失败: ' + (e?.message || e));
      return { success: true };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: '信号文件输出路径（默认 ~/.webauto/handshakes/1688-login.json）' },
        status: { type: 'string', description: '状态 success/failed/waiting', default: 'success' }
      }
    };
  }
}

export default HandshakeSignalNode;
