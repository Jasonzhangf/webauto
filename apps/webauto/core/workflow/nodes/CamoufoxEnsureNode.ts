// Camoufox 确保节点：若未配置 CAMOUFOX_PATH，则尝试解析包；未安装则自动安装
import BaseNode from './BaseNode';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

export default class CamoufoxEnsureNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'CamoufoxEnsureNode';
    this.description = '确保 Camoufox 可用（解析 env/package；必要时自动安装）';
  }

  async execute(context: any, params: any): Promise<any> {
    const { logger, variables } = context;
    try {
      let camoufoxPath = process.env.CAMOUFOX_PATH || '';
      const resolveBinary = (p) => {
        if (!p) return '';
        try {
          if (existsSync(p)) {
            // 1) 若是 macOS app 目录
            const mac1 = p + '/Camoufox.app/Contents/MacOS/camoufox';
            const mac2 = p + '/Camoufox.app/Contents/MacOS/firefox';
            if (existsSync(mac1)) return mac1;
            if (existsSync(mac2)) return mac2;
            // 2) 若 p 为目录，搜索可执行文件
            try {
              const found = execSync(`bash -lc 'test -d "${p}" && (find "${p}" -maxdepth 3 -type f \( -name "camoufox*" -o -name "firefox*" \) -perm +111 | head -n 1) || true'`, { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
              if (found && existsSync(found)) return found;
            } catch {}
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
      async function resolveFromModule(m): Promise<any> {
        if (!m) return '';
        try { if (m.getLaunchPath) { const p = await m.getLaunchPath(); return p || ''; } } catch {}
        try { if (m.launchOptions?.executablePath) return m.launchOptions.executablePath; } catch {}
        return '';
      }
      camoufoxPath = resolveBinary(await resolveFromModule(mod));

      // 检查是否需要安装（改进逻辑：避免重复安装）
      let needsInstall = false;
      if (!camoufoxPath || !existsSync(camoufoxPath)) {
        needsInstall = true;
        logger.info('🔍 从模块解析失败，尝试安装');
      } else {
        // 验证现有安装是否可用
        try {
          // 尝试执行camoufox --version验证安装
          const version = execSync(`"${camoufoxPath}" --version`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 5000
          }).trim();
          if (version) {
            logger.info(`✅ Camoufox已安装且可用: ${version}`);
            variables.set('camoufoxPath', camoufoxPath);
            context.engine?.recordBehavior?.('camoufox_path', { source: 'existing', camoufoxPath, version });
            return { success: true, variables: { camoufoxPath } };
          } else {
            logger.warn('⚠️ Camoufox版本检查失败，尝试重新安装');
            needsInstall = true;
          }
        } catch (e) {
          logger.warn(`⚠️ 现有Camoufox不可用: ${e.message}，尝试重新安装`);
          needsInstall = true;
        }
      }

      if (needsInstall) {
        // 自动安装
        logger.info('📦 安装/下载 Camoufox 浏览器 (npm i camoufox && camoufox.downloadBrowser) ...');

        // 检查包是否已安装，避免重复npm install
        try {
          execSync('npm list camoufox', { stdio: ['ignore', 'pipe', 'ignore'] });
          logger.info('📦 camoufox包已存在，跳过npm install');
        } catch {
          logger.info('📦 安装camoufox包...');
          execSync('npm i camoufox@^0.1.12', { stdio: 'inherit' });
        }

        // 重新导入模块
        try {
          // 清除模块缓存以确保获取最新版本
          delete require.cache[require.resolve('camoufox')];
          mod = await import('camoufox');
        } catch {}

        // 检查浏览器是否已下载
        try {
          const testPath = await resolveFromModule(mod);
          if (testPath && existsSync(testPath)) {
            logger.info('📦 Camoufox浏览器已存在，跳过下载');
          } else if (mod?.downloadBrowser) {
            logger.info('📦 下载Camoufox浏览器...');
            await mod.downloadBrowser();
          }
        } catch (e) {
          logger.warn(`⚠️ 浏览器下载检查失败: ${e.message}`);
        }

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

      // 确保可执行权限（macOS/Linux）
      try { execSync(`chmod +x "${camoufoxPath}"`, { stdio: 'ignore' }); } catch {}
      // 移除下载隔离（macOS 可选）
      try { execSync(`xattr -dr com.apple.quarantine "${camoufoxPath}"`, { stdio: 'ignore' }); } catch {}

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
