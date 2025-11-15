// 导航节点
import BaseNode from './BaseNode.js';
import { safeAccessManager } from '../../../core/SafePageAccessManager.js';

class NavigationNode extends BaseNode {
    constructor() {
        super();
        this.name = 'NavigationNode';
        this.description = '导航到指定URL';
    }

    async execute(context) {
        const { config, logger, variables, page } = context;

        try {
            // 构建目标URL
            let url = config.url;
            if (!url) {
                // 从变量中获取URL
                url = variables.get('targetUrl');
                if (!url) {
                    throw new Error('未提供目标URL');
                }
            }

            // 处理模板字符串
            url = this.renderTemplate(url, variables);

            logger.info(`🌐 导航到: ${url}`);

            // 行为记录：准备导航
            context.engine?.recordBehavior?.('navigate_request', { url });

            // 使用安全访问管理器导航到目标页面
            const accessResult = await safeAccessManager.safePageAccess(page, url, {
                waitUntil: config.waitUntil || 'domcontentloaded',
                timeout: config.timeout || 30000
            });

            if (!accessResult.success) {
                logger.error(`🚨 安全访问失败: ${url}`);
                throw new Error(`安全访问失败: ${url}`);
            }

            // 等待页面加载
            if (config.waitTime) {
                await this.sleep(config.waitTime);
            }

            logger.info('✅ 页面导航成功');
            context.engine?.recordBehavior?.('navigate_success', { url: page.url() });

            return {
                success: true,
                variables: {
                    currentUrl: page.url(),
                    navigationCompleted: true,
                    lastNavigationTime: new Date().toISOString()
                }
            };

        } catch (error) {
            logger.error(`❌ 页面导航失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: '目标URL'
                },
                waitUntil: {
                    type: 'string',
                    enum: ['load', 'domcontentloaded', 'networkidle'],
                    description: '等待条件',
                    default: 'domcontentloaded'
                },
                timeout: {
                    type: 'number',
                    description: '超时时间（毫秒）',
                    default: 30000
                },
                waitTime: {
                    type: 'number',
                    description: '等待时间（毫秒）'
                }
            },
            required: []
        };
    }

    getInputs() {
        return [
            {
                name: 'page',
                type: 'object',
                description: '页面实例'
            },
            {
                name: 'variables',
                type: 'object',
                description: '变量管理器'
            }
        ];
    }

    getOutputs() {
        return [
            {
                name: 'currentUrl',
                type: 'string',
                description: '当前URL'
            },
            {
                name: 'navigationCompleted',
                type: 'boolean',
                description: '导航完成状态'
            }
        ];
    }
}

export default NavigationNode;
