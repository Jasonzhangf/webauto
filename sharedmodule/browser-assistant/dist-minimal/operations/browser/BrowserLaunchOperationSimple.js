"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserLaunchOperation = void 0;
const BaseOperationSimple_1 = require("../core/BaseOperationSimple");
class BrowserLaunchOperation extends BaseOperationSimple_1.BaseOperation {
    name = 'browser-launch';
    description = 'Launch browser instance with specified configuration';
    version = '1.0.0';
    author = 'WebAuto Team';
    abstractCategories = ['browser', 'launch'];
    supportedContainers = ['any'];
    capabilities = ['browser-launch', 'configuration'];
    async execute(context, params) {
        try {
            const config = params || {};
            // 模拟浏览器启动逻辑
            console.log(`Launching browser with config:`, config);
            // 在实际实现中，这里会启动真实的浏览器
            context.browser = {
                type: config.browserType || 'camoufox',
                headless: config.headless || false,
                launched: true,
                close: async () => console.log('Browser closed')
            };
            context.page = {
                url: 'about:blank',
                title: 'New Page',
                goto: async (url) => console.log(`Navigating to: ${url}`)
            };
            return {
                success: true,
                result: {
                    browserType: config.browserType || 'camoufox',
                    headless: config.headless || false,
                    launched: true
                },
                metadata: {
                    launchTime: Date.now(),
                    config
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                metadata: {
                    params
                }
            };
        }
    }
    validate(context, params) {
        const errors = [];
        if (params?.browserType && !['camoufox', 'playwright'].includes(params.browserType)) {
            errors.push('Browser type must be either "camoufox" or "playwright"');
        }
        if (params?.viewport && (!params.viewport.width || !params.viewport.height)) {
            errors.push('Viewport must include both width and height');
        }
        return {
            isValid: errors.length === 0,
            score: errors.length === 0 ? 100 : Math.max(0, 100 - errors.length * 25),
            issues: errors,
            warnings: [],
            checks: [
                {
                    name: 'browserType',
                    passed: !params?.browserType || ['camoufox', 'playwright'].includes(params.browserType),
                    message: params?.browserType ? `Browser type: ${params.browserType}` : 'Default browser type'
                },
                {
                    name: 'viewport',
                    passed: !params?.viewport || (params.viewport.width && params.viewport.height),
                    message: params?.viewport ? `Viewport: ${params.viewport.width}x${params.viewport.height}` : 'Default viewport'
                }
            ]
        };
    }
    getCapabilities() {
        return {
            supportedContentTypes: ['html', 'json'],
            supportedLanguages: ['any'],
            maxContentSize: 0,
            processingSpeed: 'fast',
            isRealtime: true,
            requiresInternet: false,
            requiresBrowser: false
        };
    }
}
exports.BrowserLaunchOperation = BrowserLaunchOperation;
//# sourceMappingURL=BrowserLaunchOperationSimple.js.map