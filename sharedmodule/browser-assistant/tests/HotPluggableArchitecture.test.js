const { HotPluggableArchitecture } = require('../core/HotPluggableArchitecture');
const { CookieManager } = require('../core/CookieManager');
const { SecurityManager } = require('../core/SecurityManager');
const { PerformanceMonitor } = require('../core/PerformanceMonitor');
const path = require('path');

/**
 * 热插拔架构测试套件 - 必须加载cookie后测试
 */
describe('HotPluggableArchitecture', () => {
    let architecture;
    let cookieManager;
    let securityManager;
    let performanceMonitor;

    beforeAll(async () => {
        // 初始化组件
        architecture = new HotPluggableArchitecture();
        cookieManager = new CookieManager();
        securityManager = new SecurityManager();
        performanceMonitor = new PerformanceMonitor();

        // 开始性能监控
        performanceMonitor.startSession();
    });

    afterAll(async () => {
        // 清理资源
        if (architecture) {
            await architecture.cleanup();
        }
        
        // 结束性能监控
        performanceMonitor.endSession();
        
        // 输出性能报告
        const report = performanceMonitor.getPerformanceReport();
        console.log('📊 性能测试报告:', JSON.stringify(report, null, 2));
    });

    describe('架构初始化', () => {
        test('应该正确初始化默认策略', () => {
            expect(architecture.strategies.size).toBeGreaterThan(0);
            
            // 检查默认滚动策略
            expect(architecture.getStrategy('scroll', 'vertical-infinite')).toBeDefined();
            expect(architecture.getStrategy('scroll', 'vertical-paginated')).toBeDefined();
            
            // 检查默认交互策略
            expect(architecture.getStrategy('interaction', 'direct-click')).toBeDefined();
            
            // 检查默认提取策略
            expect(architecture.getStrategy('extraction', 'structured')).toBeDefined();
        });

        test('应该正确初始化事件总线', () => {
            expect(architecture.eventBus).toBeDefined();
            expect(architecture.eventBus.events).toBeInstanceOf(Map);
        });

        test('应该正确初始化安全组件', () => {
            expect(architecture.securityManager).toBeDefined();
            expect(architecture.cookieManager).toBeDefined();
            expect(architecture.performanceMonitor).toBeDefined();
        });
    });

    describe('Cookie 管理', () => {
        test('应该能够检查微博 cookie 状态', async () => {
            const startTime = Date.now();
            
            const hasCookies = await cookieManager.hasCookies('weibo.com');
            const duration = Date.now() - startTime;
            
            performanceMonitor.recordOperation('cookie_check', hasCookies, duration);
            
            console.log(`🔍 Cookie 检查结果: weibo.com - ${hasCookies}`);
            
            // 记录测试结果
            expect(typeof hasCookies).toBe('boolean');
        });

        test('应该能够验证微博 cookie 有效性', async () => {
            const startTime = Date.now();
            
            const validation = await cookieManager.validateCookies('weibo.com');
            const duration = Date.now() - startTime;
            
            performanceMonitor.recordOperation('cookie_validation', validation.valid, duration);
            
            console.log(`🔍 Cookie 验证结果:`, validation);
            
            expect(validation).toHaveProperty('valid');
            expect(validation).toHaveProperty('total');
            expect(validation).toHaveProperty('validCount');
        });

        test('应该能够批量验证多个域名', async () => {
            const domains = ['weibo.com', 'xiaohongshu.com'];
            const startTime = Date.now();
            
            const results = await cookieManager.batchValidateCookies(domains);
            const duration = Date.now() - startTime;
            
            performanceMonitor.recordOperation('batch_cookie_validation', true, duration);
            
            console.log(`🔍 批量 Cookie 验证结果:`, Object.fromEntries(results));
            
            expect(results).toBeInstanceOf(Map);
            expect(results.size).toBe(domains.length);
        });
    });

    describe('安全检查', () => {
        test('应该能够进行基本的安全检查', () => {
            const mockOperation = { type: 'navigate' };
            const mockPage = {
                url: () => 'https://weibo.com'
            };
            
            const result = securityManager.checkBeforeOperation(mockPage, mockOperation);
            
            expect(result).toHaveProperty('allowed');
            expect(result).toHaveProperty('recommendations');
        });

        test('应该能够添加随机延迟', async () => {
            const startTime = Date.now();
            await securityManager.addRandomDelay(100, 500);
            const duration = Date.now() - startTime;
            
            expect(duration).toBeGreaterThanOrEqual(100);
            expect(duration).toBeLessThanOrEqual(500);
        });

        test('应该能够添加人类行为延迟', async () => {
            const startTime = Date.now();
            await securityManager.addHumanDelay();
            const duration = Date.now() - startTime;
            
            expect(duration).toBeGreaterThan(0);
        });

        test('应该能够检测风险模式', () => {
            // 添加一些模拟操作历史
            securityManager.operationHistory = [
                { type: 'click', timestamp: Date.now() },
                { type: 'click', timestamp: Date.now() },
                { type: 'click', timestamp: Date.now() }
            ];
            
            const result = securityManager.checkRiskPatterns({ type: 'click' });
            
            expect(result).toHaveProperty('allowed');
        });
    });

    describe('策略热插拔', () => {
        test('应该能够注册新策略', () => {
            const mockStrategy = {
                execute: jest.fn(),
                initialize: jest.fn(),
                cleanup: jest.fn()
            };
            
            expect(() => {
                architecture.registerStrategy('test', 'mock-strategy', mockStrategy);
            }).not.toThrow();
            
            expect(architecture.getStrategy('test', 'mock-strategy')).toBe(mockStrategy);
        });

        test('应该能够热替换策略', async () => {
            const oldStrategy = {
                execute: jest.fn(),
                cleanup: jest.fn()
            };
            
            const newStrategy = {
                execute: jest.fn(),
                initialize: jest.fn()
            };
            
            // 先注册旧策略
            architecture.registerStrategy('test', 'replaceable', oldStrategy);
            
            // 替换策略
            await expect(architecture.replaceStrategy('test', 'replaceable', newStrategy))
                .resolves.not.toThrow();
            
            expect(architecture.getStrategy('test', 'replaceable')).toBe(newStrategy);
        });

        test('应该能够处理重复策略注册', () => {
            const mockStrategy = { execute: jest.fn() };
            
            architecture.registerStrategy('test', 'duplicate', mockStrategy);
            
            expect(() => {
                architecture.registerStrategy('test', 'duplicate', mockStrategy);
            }).toThrow('Strategy test:duplicate already registered');
        });
    });

    describe('插件系统', () => {
        test('应该能够注册插件', async () => {
            const mockPlugin = {
                initialize: jest.fn(),
                cleanup: jest.fn()
            };
            
            await expect(architecture.registerPlugin('test-plugin', mockPlugin))
                .resolves.not.toThrow();
            
            expect(mockPlugin.initialize).toHaveBeenCalledWith(architecture);
            expect(architecture.plugins.has('test-plugin')).toBe(true);
        });

        test('应该能够注销插件', async () => {
            const mockPlugin = {
                initialize: jest.fn(),
                cleanup: jest.fn()
            };
            
            await architecture.registerPlugin('temp-plugin', mockPlugin);
            await expect(architecture.unregisterPlugin('temp-plugin'))
                .resolves.not.toThrow();
            
            expect(mockPlugin.cleanup).toHaveBeenCalled();
            expect(architecture.plugins.has('temp-plugin')).toBe(false);
        });
    });

    describe('站点配置加载', () => {
        test('应该能够加载微博配置', async () => {
            const startTime = Date.now();
            
            await expect(architecture.loadSiteConfig('weibo'))
                .resolves.not.toThrow();
            
            const duration = Date.now() - startTime;
            performanceMonitor.recordOperation('load_config', true, duration);
            
            expect(architecture.configurations.has('weibo')).toBe(true);
            
            const config = architecture.configurations.get('weibo');
            expect(config).toHaveProperty('site');
            expect(config).toHaveProperty('domain');
            expect(config).toHaveProperty('requiresAuth');
        });

        test('应该处理配置加载错误', async () => {
            await expect(architecture.loadSiteConfig('nonexistent'))
                .rejects.toThrow('Failed to load site config nonexistent');
        });
    });

    describe('浏览器初始化 (需要 Cookie)', () => {
        beforeAll(async () => {
            // 检查是否有微博 cookie
            const hasWeiboCookies = await cookieManager.hasCookies('weibo.com');
            
            if (!hasWeiboCookies) {
                console.warn('⚠️ 未找到微博 cookie，跳过浏览器初始化测试');
            }
        });

        test('应该能够初始化浏览器 (需要有效 cookie)', async () => {
            // 首先加载配置
            await architecture.loadSiteConfig('weibo');
            
            // 检查是否有 cookie
            const hasCookies = await cookieManager.hasCookies('weibo.com');
            
            if (!hasCookies) {
                console.log('⏭️  跳过浏览器初始化测试 - 缺少有效 cookie');
                return;
            }
            
            const startTime = Date.now();
            
            await expect(architecture.initializeBrowser({ headless: false }))
                .resolves.not.toThrow();
            
            const duration = Date.now() - startTime;
            performanceMonitor.recordOperation('browser_init', true, duration);
            
            expect(architecture.browser).toBeDefined();
            expect(architecture.context).toBeDefined();
            expect(architecture.page).toBeDefined();
        }, 30000);

        test('应该拒绝无 cookie 的浏览器初始化', async () => {
            // 加载需要认证的配置
            await architecture.loadSiteConfig('weibo');
            
            // 临时删除 cookie 文件来模拟无 cookie 状态
            const cookiePath = cookieManager.getCookieFilePath('weibo.com');
            const fs = require('fs').promises;
            
            try {
                await fs.unlink(cookiePath);
            } catch (error) {
                // 文件不存在也正常
            }
            
            await expect(architecture.initializeBrowser({ headless: false }))
                .rejects.toThrow('安全检查失败: weibo 需要登录但没有有效的cookie');
        });
    });

    describe('滚动策略测试', () => {
        test('垂直无限滚动策略应该存在', () => {
            const strategy = architecture.getStrategy('scroll', 'vertical-infinite');
            expect(strategy).toBeDefined();
            expect(strategy.execute).toBeInstanceOf(Function);
        });

        test('垂直分页滚动策略应该存在', () => {
            const strategy = architecture.getStrategy('scroll', 'vertical-paginated');
            expect(strategy).toBeDefined();
            expect(strategy.execute).toBeInstanceOf(Function);
        });
    });

    describe('性能监控', () => {
        test('应该能够记录操作性能', () => {
            const initialReport = performanceMonitor.getPerformanceReport();
            
            performanceMonitor.recordOperation('test_operation', true, 100);
            
            const finalReport = performanceMonitor.getPerformanceReport();
            
            expect(finalReport.session.operations).toBe(initialReport.session.operations + 1);
        });

        test('应该能够检测性能警告', () => {
            performanceMonitor.recordOperation('slow_operation', true, 6000);
            
            const warnings = performanceMonitor.metrics.warnings;
            const slowOperationWarning = warnings.find(w => w.type === 'slow_operation');
            
            expect(slowOperationWarning).toBeDefined();
        });

        test('应该能够生成性能报告', () => {
            const report = performanceMonitor.getPerformanceReport();
            
            expect(report).toHaveProperty('session');
            expect(report).toHaveProperty('operationStats');
            expect(report).toHaveProperty('recommendations');
            expect(report).toHaveProperty('thresholds');
        });
    });

    describe('错误处理', () => {
        test('应该能够处理操作错误', async () => {
            const mockPage = {
                url: () => 'https://weibo.com',
                context: () => ({ cookies: () => [] })
            };
            
            const mockError = new Error('Test error');
            
            await expect(securityManager.handleOperationError(mockPage, { type: 'click' }, mockError))
                .resolves.not.toThrow();
        });

        test('应该能够添加错误记录', () => {
            const mockError = new Error('Test error');
            const mockOperation = { type: 'click' };
            
            performanceMonitor.addError(mockError, mockOperation);
            
            const errors = performanceMonitor.metrics.errors;
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[errors.length - 1].error).toBe(mockError.message);
        });
    });

    describe('事件总线', () => {
        test('应该能够发送和接收事件', () => {
            const mockCallback = jest.fn();
            
            architecture.eventBus.on('test-event', mockCallback);
            architecture.eventBus.emit('test-event', { data: 'test' });
            
            expect(mockCallback).toHaveBeenCalledWith({ data: 'test' });
        });

        test('应该能够取消事件监听', () => {
            const mockCallback = jest.fn();
            
            architecture.eventBus.on('test-event', mockCallback);
            architecture.eventBus.off('test-event', mockCallback);
            architecture.eventBus.emit('test-event', { data: 'test' });
            
            expect(mockCallback).not.toHaveBeenCalled();
        });
    });
});

/**
 * 集成测试 - 模拟真实使用场景
 */
describe('HotPluggableArchitecture Integration', () => {
    let architecture;

    beforeEach(() => {
        architecture = new HotPluggableArchitecture();
    });

    afterEach(async () => {
        if (architecture) {
            await architecture.cleanup();
        }
    });

    test('完整的工作流程测试', async () => {
        // 1. 加载配置
        await architecture.loadSiteConfig('weibo');
        
        // 2. 检查 cookie
        const cookieManager = architecture.cookieManager;
        const hasCookies = await cookieManager.hasCookies('weibo.com');
        
        // 3. 如果有 cookie，进行完整测试
        if (hasCookies) {
            // 4. 初始化浏览器
            await architecture.initializeBrowser({ headless: false });
            
            // 5. 导航到页面
            const result = await architecture.executeOperation({
                type: 'navigate'
            }, { url: 'https://weibo.com' });
            
            expect(result.success).toBe(true);
            
            // 6. 执行滚动操作
            const scrollResult = await architecture.executeOperation({
                type: 'scroll'
            }, { maxItems: 10 });
            
            expect(scrollResult).toBeDefined();
        }
        
        // 7. 无论是否有 cookie，架构都应该正常工作
        expect(architecture.configurations.has('weibo')).toBe(true);
    }, 60000);
});

// 导出测试工具函数
module.exports = {
    createTestArchitecture: () => new HotPluggableArchitecture(),
    createTestCookieManager: () => new CookieManager(),
    createTestSecurityManager: () => new SecurityManager(),
    createTestPerformanceMonitor: () => new PerformanceMonitor()
};