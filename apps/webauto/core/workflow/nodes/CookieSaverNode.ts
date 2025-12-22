// Cookie保存节点
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import os from 'node:os';
import BaseNode from './BaseNode';

class CookieSaverNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'CookieSaverNode';
    this.description = '将当前浏览器上下文中的 Cookie 保存到指定路径';
  }

  async execute(context: any, params: any): Promise<any> {
    const { config, logger, context: browserContext } = context;
    try {
      logger.info('💾 保存 Cookie...');
      let cookiePath = config.cookiePath;
      if (!cookiePath) throw new Error('未提供 cookiePath');

      // 展开 ~ 前缀
      if (cookiePath.startsWith('~/')) {
        cookiePath = join(os.homedir(), cookiePath.slice(2));
      }

      const cookies = await browserContext.cookies();
      mkdirSync(dirname(cookiePath), { recursive: true });
      writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
      logger.info(`✅ 已保存 ${cookies.length} 条 Cookie -> ${cookiePath}`);

      return {
        success: true,
        variables: {
          cookieSaved: true,
          cookieSavePath: cookiePath,
          cookieSaveCount: cookies.length
        }
      };
    } catch (error) {
      logger.error(`❌ Cookie 保存失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        cookiePath: { type: 'string', description: 'Cookie 输出路径' }
      },
      required: ['cookiePath']
    };
  }
}

export default CookieSaverNode;

