// 浏览器初始化节点
import { chromium } from 'playwright';
import BaseNode from './BaseNode.js';

class BrowserInitNode extends BaseNode {
    constructor() {
        super();
        this.name = 'BrowserInitNode';
        this.description = '初始化浏览器实例';
    }

    async execute(context) {
        const { config, logger } = context;

        try {
            logger.info('🌐 初始化浏览器...');
            logger.info('配置信息:', JSON.stringify(config, null, 2));

            const browser = await chromium.launch({
                headless: config?.headless !== false,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const contextObj = await browser.newContext({
                userAgent: config?.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: config?.viewport || { width: 1920, height: 1080 }
            });

            const page = await contextObj.newPage();

            logger.info('✅ 浏览器初始化成功');

            return {
                success: true,
                browser: browser,
                context: contextObj,
                page: page,
                variables: {
                    browserInitialized: true,
                    browserInfo: {
                        headless: config?.headless !== false,
                        viewport: config?.viewport || { width: 1920, height: 1080 }
                    }
                }
            };

        } catch (error) {
            logger.error(`❌ 浏览器初始化失败: ${error.message}`);
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
                headless: {
                    type: 'boolean',
                    description: '是否无头模式',
                    default: true
                },
                viewport: {
                    type: 'object',
                    properties: {
                        width: { type: 'number', default: 1920 },
                        height: { type: 'number', default: 1080 }
                    },
                    description: '浏览器视窗大小'
                },
                userAgent: {
                    type: 'string',
                    description: '用户代理字符串'
                }
            },
            required: []
        };
    }

    getInputs() {
        return [];
    }

    getOutputs() {
        return [
            {
                name: 'browser',
                type: 'object',
                description: '浏览器实例'
            },
            {
                name: 'context',
                type: 'object',
                description: '浏览器上下文'
            },
            {
                name: 'page',
                type: 'object',
                description: '页面实例'
            },
            {
                name: 'browserInitialized',
                type: 'boolean',
                description: '浏览器初始化状态'
            }
        ];
    }
}

export default BrowserInitNode;