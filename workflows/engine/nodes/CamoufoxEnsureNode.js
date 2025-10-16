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
      const resolveBinary = (p) => {
        if (!p) return '';
        try {
          if (!p.endsWith('camoufox') && !p.endsWith('firefox') && existsSync(p)) {
            const mac1 = p + '/Camoufox.app/Contents/MacOS/camoufox';
            const mac2 = p + '/Camoufox.app/Contents/MacOS/firefox';
            if (existsSync(mac1)) return mac1;
            if (existsSync(mac2)) return mac2;
          }
        } catch {}
        return p;
      };
      if (camoufoxPath && existsSync(camoufoxPath)) {
        camoufoxPath = resolveBinary(camoufoxPath);
        variables.set('camoufoxPath', camoufoxPath);
        context.engine?.recordBehavior?.('camoufox_path', { source: 'env', camoufoxPath });
        return { success: true, variables: { camoufoxPath } };
      }

      // 尝试从已安装的包解析
      let mod = null;
      try { mod = await import('camoufox'); } catch {}
      async function resolveFromModule(m) {
        if (!m) return '';
        try { if (m.getLaunchPath) { const p = await m.getLaunchPath(); return p || ''; } } catch {}
        try { if (m.launchOptions?.executablePath) return m.launchOptions.executablePath; } catch {}
        return '';
      }
      camoufoxPath = resolveBinary(await resolveFromModule(mod));
      if (!camoufoxPath || !existsSync(camoufoxPath)) {
        // 自动安装
        logger.info('📦 安装/下载 Camoufox 浏览器 (npm i camoufox && camoufox.downloadBrowser) ...');
        execSync('npm i camoufox@^0.1.12', { stdio: 'inherit' });
        try { mod = await import('camoufox'); } catch {}
        try { if (mod?.downloadBrowser) { await mod.downloadBrowser(); } } catch {}
        camoufoxPath = resolveBinary(await resolveFromModule(mod));
      }

      // 使用 Python CLI 路径作为补充
      if (!camoufoxPath || !existsSync(camoufoxPath)) {
        try {
          const out = execSync('python3 -m camoufox path', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
          if (out) {
            let p = resolveBinary(out);
            if (!existsSync(p)) {
              // 递归查找 Camoufox.app
              try {
                const found = execSync(`bash -lc 'find ${out} -maxdepth 3 -type f -path "*Camoufox.app/Contents/MacOS/*" | head -n 1'`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
                if (found) p = found;
              } catch {}
            }
            if (existsSync(p)) camoufoxPath = p;
          }
        } catch {}
      }

      // 常见系统安装路径猜测
      if (!camoufoxPath || !existsSync(camoufoxPath)) {
        const candidates = [
          '/Applications/Camoufox.app/Contents/MacOS/firefox', // macOS
          process.env.HOME ? `${process.env.HOME}/Camoufox/firefox` : '', // Linux 用户目录
          'C:/Program Files/Camoufox/camoufox.exe', // Windows x64
          'C:/Program Files (x86)/Camoufox/camoufox.exe'
        ].filter(Boolean);
        for (const p of candidates) {
          if (existsSync(p)) { camoufoxPath = p; break; }
        }
      }

      if (!camoufoxPath || !existsSync(camoufoxPath)) {
        logger.error('❌ 无法解析 Camoufox 可执行路径。请设置环境变量 CAMOUFOX_PATH');
        return { success: false, error: 'Camoufox not found' };
      }

      variables.set('camoufoxPath', camoufoxPath);
      try { process.env.CAMOUFOX_PATH = camoufoxPath; } catch {}
      context.engine?.recordBehavior?.('camoufox_path', { source: mod ? 'package' : 'install', camoufoxPath });
      return { success: true, variables: { camoufoxPath } };

    } catch (e) {
      logger.error('❌ Camoufox 确保失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }
}
