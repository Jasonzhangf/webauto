// 注入容器索引到页面上下文：window.__containerIndex
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import BaseNode from './BaseNode.js';

export default class InjectContainerIndexNode extends BaseNode {
  constructor() {
    super();
    this.name = 'InjectContainerIndexNode';
    this.description = '将 containers/<tier>/<site>/index.json 注入为 window.__containerIndex';
  }

  resolveSiteFolder(site) {
    // 支持 weibo 与 weibo.com 两种形式；优先使用 catalog.json 中的 preferredFolder
    try {
      const catalogPath = join(process.cwd(), 'containers', 'catalog.json');
      if (existsSync(catalogPath)) {
        const cat = JSON.parse(readFileSync(catalogPath, 'utf8'));
        const entry = cat?.sites?.[site];
        if (entry?.preferredFolder) return entry.preferredFolder;
      }
    } catch {}
    return site;
  }

  getIndexPath(tier, site) {
    const folder = this.resolveSiteFolder(site);
    const p = join(process.cwd(), 'containers', tier, folder, 'index.json');
    if (existsSync(p)) return p;
    // fallback: try raw site
    const fallback = join(process.cwd(), 'containers', tier, site, 'index.json');
    return existsSync(fallback) ? fallback : null;
  }

  async execute(context) {
    const { page, logger, config } = context;
    if (!page) return { success: false, error: 'no page available' };

    const site = config?.site || 'weibo.com';
    const tier = config?.tier || 'staging';

    try {
      const indexPath = this.getIndexPath(tier, site);
      if (!indexPath) {
        throw new Error(`index.json not found for site=${site}, tier=${tier}`);
      }
      const raw = readFileSync(indexPath, 'utf8');
      const data = JSON.parse(raw);
      await page.addInitScript((idx) => { window.__containerIndex = idx; }, data);
      // 若页面已加载，则立即注入
      try { await page.evaluate((idx) => { window.__containerIndex = idx; }, data); } catch {}
      logger.info(`🧩 已注入容器索引: ${indexPath}`);
      return { success: true, variables: { injectedIndex: true, indexPath } };
    } catch (e) {
      logger.error(`❌ 注入容器索引失败: ${e?.message || e}`);
      return { success: false, error: e?.message || String(e) };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        site: { type: 'string', description: '站点标识（如 weibo 或 weibo.com）' },
        tier: { type: 'string', enum: ['staging','approved'], default: 'staging' }
      }
    };
  }
}

