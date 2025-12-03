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
        const { config, logger, variables } = context;

        try {
            // 默认不允许新开浏览器，除非显式允许（allowLaunch=true）
            const allowLaunch = variables?.get('allowLaunch') === true || config?.allowLaunch === true;
            if (!allowLaunch) {
                return { success: false, error: 'attach-only mode: BrowserInitNode blocked. Provide sessionId + AttachSessionNode or set allowLaunch=true explicitly.' };
            }
            logger.info('🌐 初始化浏览器...');
            logger.info('配置信息:', JSON.stringify(config, null, 2));

            const engine = (config?.engine || config?.browser || 'chromium').toLowerCase();
            const headless = config?.headless !== false;
            const ua = config?.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            const viewport = config?.viewport || { width: 1920, height: 1080 };
            const dynamicViewport = config?.dynamicViewport !== false && !headless; // 无头模式下不启用动态viewport
            let browser;
            let contextObj;

            // 解析 userDataDir（可用模板 {sessionId} ）
            const replaceVars = (s) => {
                if (!s) return s;
                return String(s).replace('{sessionId}', (context.variables && context.variables.get('sessionId')) || 'session');
            };
            let userDataDir = replaceVars(config?.userDataDirTemplate) || replaceVars(config?.userDataDir);
            if (userDataDir && userDataDir.startsWith('~/')) userDataDir = join(homedir(), userDataDir.slice(2));
            if (userDataDir) { try { mkdirSync(userDataDir, { recursive: true }); } catch {} }

            if (engine === 'camoufox' || engine === 'firefox') {
                let executablePath = config?.executablePath || (context.variables && context.variables.get('camoufoxPath')) || process.env.CAMOUFOX_PATH || '';
                try {
                    if (!executablePath && engine === 'camoufox') {
                        // 尝试从包解析（要求外部确保安装）
                        const mod = await import('camoufox').catch(() => null);
                        if (mod && (mod.default?.executablePath || mod.executablePath)) {
                            executablePath = mod.default?.executablePath || mod.executablePath;
                        }
                    }
                } catch {}

                const launchOpts = { headless, args: config?.launchArgs || [] };
                if (executablePath) launchOpts.executablePath = executablePath;
                if (engine === 'camoufox' && !executablePath) {
                    throw new Error('Camoufox required but not found. Run CamoufoxEnsureNode or set CAMOUFOX_PATH.');
                }
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

            // 注入WebAuto统一高亮服务
            try {
                const highlightServicePath = '/Users/fanzhang/Documents/github/webauto/src/modules/highlight/highlight-service.js';
                await contextObj.addInitScript({
                    path: highlightServicePath
                });
                logger.info('✅ 注入WebAuto统一高亮服务');
            } catch (error) {
                logger.warn('⚠️ 高亮服务注入失败:', error.message);
            }

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

            context.engine?.recordBehavior?.('browser_init', { engine, headless, viewport, dynamicViewport });

            const page = await contextObj.newPage();
            context.engine?.recorder?.attachPage?.(page);

            // 启用动态视口调整（非无头模式下）
            if (dynamicViewport) {
                try {
                    logger.info('🔄 启用动态视口调整');
                    // 为窗口对象添加事件监听，使视口能够随窗口大小动态变化
                    await contextObj.addInitScript(() => {
                        // 监听窗口大小变化事件
                        window.addEventListener('resize', () => {
                            try {
                                // 获取当前窗口的实际内尺寸
                                const { innerWidth, innerHeight } = window;
                                
                                // 通过playwright的方式更新视口大小
                                // 注意：这里我们使用一种特殊方式来通知playwright更新视口
                                // 实际的视口更新会在下一次页面交互时生效
                                if (window.innerWidth !== window.outerWidth) {
                                    // 标记需要更新视口
                                    window.__webauto_viewport_needs_update = true;
                                    window.__webauto_viewport_width = innerWidth;
                                    window.__webauto_viewport_height = innerHeight;
                                }
                            } catch (e) {
                                console.error('更新视口失败:', e);
                            }
                        });
                    });
                    
                    // 在Node.js端添加定期检查和更新视口的逻辑
                    // 注意：由于Playwright限制，我们不能直接从页面获取事件来更新视口
                    // 这里我们添加一个周期性检查的机制
                    if (contextObj && !headless) {
                        // 每500ms检查一次页面是否需要更新视口
                        const viewportInterval = setInterval(async () => {
                            try {
                                const needsUpdate = await page.evaluate(() => window.__webauto_viewport_needs_update);
                                if (needsUpdate) {
                                    const width = await page.evaluate(() => window.__webauto_viewport_width || window.innerWidth);
                                    const height = await page.evaluate(() => window.__webauto_viewport_height || window.innerHeight);
                                    // 更新页面的视口大小
                                    await page.setViewportSize({ width, height });
                                    // 重置更新标志
                                    await page.evaluate(() => { window.__webauto_viewport_needs_update = false; });
                                }
                            } catch (e) {
                                // 页面可能已经关闭或导航，清除定时器
                                clearInterval(viewportInterval);
                            }
                        }, 500);
                        
                        // 保存定时器引用，以便在必要时清除
                        page._viewportInterval = viewportInterval;
                    }
                } catch (error) {
                    logger.warn('⚠️ 动态视口调整初始化失败:', error.message);
                }
            }

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
                dynamicViewport: {
                    type: 'boolean',
                    description: '是否启用视口动态调整（非无头模式下默认为true）',
                    default: true
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
