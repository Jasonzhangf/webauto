// Camoufox 确保节点：若未配置 CAMOUFOX_PATH，则尝试解析包；未安装则自动安装
import BaseNode from './BaseNode.js';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

export default class CamoufoxEnsureNode extends BaseNode {
  constructor() {
    super();
    this.name = 'CamoufoxEnsureNode';
    this.description = '确保 Camoufox 可用（解析 env/package；必要时自动安装）';
  }

  async execute(context) {
    const { logger, variables } = context;
    try {
      let camoufoxPath = process.env.CAMOUFOX_PATH || '';
      if (camoufoxPath && existsSync(camoufoxPath)) {
        variables.set('camoufoxPath', camoufoxPath);
        context.engine?.recordBehavior?.('camoufox_path', { source: 'env', camoufoxPath });
        return { success: true, variables: { camoufoxPath } };
      }

      // 尝试从已安装的包解析
      let mod = null;
      try { mod = await import('camoufox'); } catch {}
      camoufoxPath = (mod && (mod.default?.executablePath || mod.executablePath)) || '';
      if (!camoufoxPath || !existsSync(camoufoxPath)) {
        // 自动安装
        logger.info('📦 安装 Camoufox (npm i camoufox) ...');
        execSync('npm i camoufox@^0.1.12', { stdio: 'inherit' });
        try { mod = await import('camoufox'); } catch {}
        camoufoxPath = (mod && (mod.default?.executablePath || mod.executablePath)) || '';
      }

      if (!camoufoxPath || !existsSync(camoufoxPath)) {
        logger.error('❌ 无法解析 Camoufox 可执行路径。请设置环境变量 CAMOUFOX_PATH');
        return { success: false, error: 'Camoufox not found' };
      }

      variables.set('camoufoxPath', camoufoxPath);
      context.engine?.recordBehavior?.('camoufox_path', { source: mod ? 'package' : 'install', camoufoxPath });
      return { success: true, variables: { camoufoxPath } };

    } catch (e) {
      logger.error('❌ Camoufox 确保失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }
}

