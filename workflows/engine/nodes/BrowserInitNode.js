// 浏览器初始化节点
import { chromium, firefox } from 'playwright';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
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

            const engine = (config?.engine || config?.browser || 'chromium').toLowerCase();
            const headless = config?.headless !== false;
            const ua = config?.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            const viewport = config?.viewport || { width: 1920, height: 1080 };
            let browser;
            let contextObj;

            // 解析 userDataDir（可用模板 {sessionId} ）
            const replaceVars = (s) => {
                if (!s) return s;
                return String(s).replace('{sessionId}', context.variables?.get('sessionId') || 'session');
            };
            let userDataDir = replaceVars(config?.userDataDirTemplate) || replaceVars(config?.userDataDir);
            if (userDataDir && userDataDir.startsWith('~/')) userDataDir = join(homedir(), userDataDir.slice(2));
            if (userDataDir) { try { mkdirSync(userDataDir, { recursive: true }); } catch {} }

            if (engine === 'camoufox' || engine === 'firefox') {
                let executablePath = config?.executablePath || process.env.CAMOUFOX_PATH || '';
                try {
                    if (!executablePath && engine === 'camoufox') {
                        // 尝试从子模块解析 camoufox 包（若已安装）
                        const mod = await import('../../../sharedmodule/node_modules/camoufox/index.js').catch(() => null);
                        if (mod && (mod.default?.executablePath || mod.executablePath)) {
                            executablePath = mod.default?.executablePath || mod.executablePath;
                        }
                    }
                } catch {}

                const launchOpts = { headless, args: [] };
                if (executablePath) launchOpts.executablePath = executablePath;
                if (userDataDir) {
                    contextObj = await firefox.launchPersistentContext(userDataDir, launchOpts);
                    browser = contextObj.browser();
                } else {
                    browser = await firefox.launch(launchOpts);
                }
            } else {
                const args = ['--no-sandbox', '--disable-setuid-sandbox', '--lang=zh-CN', '--disable-blink-features=AutomationControlled'];
                if (userDataDir) {
                    contextObj = await chromium.launchPersistentContext(userDataDir, { headless, args });
                    browser = contextObj.browser();
                } else {
                    browser = await chromium.launch({ headless, args });
                }
            }

            if (!contextObj) {
                contextObj = await browser.newContext({
                    userAgent: ua,
                    viewport,
                    locale: 'zh-CN',
                    timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
                });
            } else {
                // 对持久化上下文设置 UA/viewport
                try { await contextObj.setDefaultNavigationTimeout(30000); } catch {}
            }

            // 严格反自动化脚本（在任何页面创建前注入）
            try {
                if (config?.strictAutomationMitigation !== false) {
                    await contextObj.addInitScript(() => {
                        try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch {}
                        try { window.chrome = window.chrome || { runtime: {} }; } catch {}
                        try { Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] }); } catch {}
                        try { Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }); } catch {}
                        try {
                            const getParameter = WebGLRenderingContext.prototype.getParameter;
                            WebGLRenderingContext.prototype.getParameter = function(param) {
                                if (param === 37445) return 'Intel Inc.'; // UNMASKED_VENDOR_WEBGL
                                if (param === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
                                return getParameter.call(this, param);
                            };
                        } catch {}
                        try {
                            const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
                            if (originalQuery) {
                                window.navigator.permissions.query = (parameters) => (
                                    parameters && parameters.name === 'notifications'
                                        ? Promise.resolve({ state: Notification.permission })
                                        : originalQuery(parameters)
                                );
                            }
                        } catch {}
                        try {
                            if (navigator.plugins && navigator.plugins.length === 0) {
                                // 简单伪造 plugins 长度
                                const fake = { length: 1 };
                                Object.setPrototypeOf(fake, PluginArray.prototype);
                                Object.defineProperty(navigator, 'plugins', { get: () => fake });
                            }
                        } catch {}
                    });
                }
            } catch {}

            // 设置常见请求头，降低风控命中
            if (config?.extraHeaders !== false) {
                try {
                    await contextObj.setExtraHTTPHeaders({
                        'Accept-Language': 'zh-CN,zh;q=0.9',
                        'DNT': '1',
                        'Upgrade-Insecure-Requests': '1'
                    });
                } catch {}
            }

            context.engine?.recordBehavior?.('browser_init', { engine, headless, viewport });

            const page = await contextObj.newPage();
            context.engine?.recorder?.attachPage?.(page);

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
