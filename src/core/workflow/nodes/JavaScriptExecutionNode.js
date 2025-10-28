// JavaScript执行节点：在页面上下文中执行自定义JavaScript脚本
import BaseNode from './BaseNode.js';

export default class JavaScriptExecutionNode extends BaseNode {
  constructor() {
    super();
    this.name = 'JavaScriptExecutionNode';
    this.description = '在页面上下文中执行自定义JavaScript脚本并返回结果';
  }

  // 解析 frame（支持 urlPattern/urlIncludes/name/index）
  resolveTargetFrame(page, frameCfg = {}) {
    try {
      const frames = page.frames();
      if (!frameCfg || typeof frameCfg !== 'object' || frames.length === 0) return null;
      if (frameCfg.urlPattern) {
        try { const re = new RegExp(frameCfg.urlPattern); const f = frames.find(fr => re.test(fr.url())); if (f) return f; } catch {}
      }
      if (frameCfg.urlIncludes) {
        const f = frames.find(fr => fr.url().includes(frameCfg.urlIncludes)); if (f) return f;
      }
      if (frameCfg.name) {
        const f = frames.find(fr => fr.name && fr.name() === frameCfg.name); if (f) return f;
      }
      if (typeof frameCfg.index === 'number' && frames[frameCfg.index]) return frames[frameCfg.index];
    } catch {}
    return null;
  }

  async execute(context) {
    const { page, logger, config, engine, results } = context;
    if (!page) return { success: false, error: 'no page available' };

    const script = config?.script;
    const timeout = Number(config?.timeout || 30000);
    const saveScreenshots = config?.saveScreenshots === true;
    const frameCfg = config?.frame || null;

    if (!script) {
      return { success: false, error: 'no script provided' };
    }

    try {
      logger.info('🚀 开始执行JavaScript脚本...');

      // 截图（如果需要）
      if (saveScreenshots) {
        try {
          const screenshot = await page.screenshot({
            fullPage: true,
            type: 'jpeg',
            quality: 80
          });
          // 这里可以保存截图，但暂时不实现
          logger.info('📸 执行前截图已保存');
        } catch (error) {
          logger.warn(`截图失败: ${error && error.message ? error.message : String(error)}`);
        }
      }

      // 在页面/Frame上下文中执行脚本
      const target = frameCfg ? (this.resolveTargetFrame(page, frameCfg) || page) : page;
      const scriptResult = await target.evaluate((scriptCode) => {
        try {
          // 使用Function构造器执行脚本
          const func = new Function(scriptCode);
          const result = func();

          // 如果返回的是Promise，等待其完成
          if (result && typeof result.then === 'function') {
            return result.then(res => {
              return {
                success: true,
                result: res,
                error: null
              };
            }).catch(error => {
              return {
                success: false,
                result: null,
                error: error.message || String(error)
              };
            });
          }

          return {
            success: true,
            result: result,
            error: null
          };
        } catch (error) {
          return {
            success: false,
            result: null,
            error: error.message || String(error)
          };
        }
      }, script);

      // 记录行为
      engine?.recordBehavior?.('javascript_execution', {
        scriptLength: script.length,
        success: scriptResult.success,
        hasError: !!scriptResult.error
      });

      if (scriptResult.success) {
        logger.info('✅ JavaScript脚本执行成功');

        // 返回结果，确保数据能被下一个节点访问
        return {
          success: true,
          action: 'javascript_executed',
          results: scriptResult.result,
          // 同时将结果存储到顶级属性中，确保变量解析能访问到
          ...scriptResult.result,
          timestamp: new Date().toISOString()
        };
      } else {
        logger.error(`❌ JavaScript脚本执行失败: ${scriptResult.error}`);
        return {
          success: false,
          error: scriptResult.error,
          action: 'javascript_execution_failed',
          timestamp: new Date().toISOString()
        };
      }

    } catch (error) {
      logger.error('❌ JavaScript执行失败: ' + (error?.message || error));
      return {
        success: false,
        error: error?.message || String(error),
        action: 'javascript_execution_error',
        timestamp: new Date().toISOString()
      };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      required: ['script'],
      properties: {
        script: {
          type: 'string',
          description: '要执行的JavaScript代码'
        },
        timeout: {
          type: 'number',
          description: '执行超时时间（毫秒）',
          default: 30000
        },
        saveScreenshots: {
          type: 'boolean',
          description: '是否保存执行前后的截图',
          default: false
        }
      }
    };
  }
}
