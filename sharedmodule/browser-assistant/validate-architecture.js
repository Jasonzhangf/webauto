#!/usr/bin/env node

/**
 * 热插拔架构验证脚本
 * 验证所有核心组件是否正常工作
 */

const { HotPluggableArchitecture } = require('./core/HotPluggableArchitecture');
const { CookieManager } = require('./core/CookieManager');
const { SecurityManager } = require('./core/SecurityManager');
const { PerformanceMonitor } = require('./core/PerformanceMonitor');

console.log('🧪 开始验证热插拔架构组件...\n');

async function validateArchitecture() {
    const results = {
        architecture: false,
        cookieManager: false,
        securityManager: false,
        performanceMonitor: false,
        strategies: false,
        plugins: false,
        configuration: false
    };

    try {
        // 1. 验证架构初始化
        console.log('1. 验证架构初始化...');
        const architecture = new HotPluggableArchitecture();
        
        if (architecture.plugins && architecture.strategies && 
            architecture.configurations && architecture.eventBus &&
            architecture.securityManager && architecture.cookieManager &&
            architecture.performanceMonitor) {
            results.architecture = true;
            console.log('   ✅ 架构初始化成功');
        } else {
            console.log('   ❌ 架构初始化失败');
        }

        // 2. 验证Cookie管理器
        console.log('\n2. 验证Cookie管理器...');
        const cookieManager = new CookieManager();
        
        if (cookieManager.cookieValidation && cookieManager.cookieBackup &&
            typeof cookieManager.hasCookies === 'function' &&
            typeof cookieManager.validateCookies === 'function') {
            results.cookieManager = true;
            console.log('   ✅ Cookie管理器初始化成功');
        } else {
            console.log('   ❌ Cookie管理器初始化失败');
        }

        // 3. 验证安全管理器
        console.log('\n3. 验证安全管理器...');
        const securityManager = new SecurityManager();
        
        if (securityManager.operationHistory && securityManager.rateLimits &&
            typeof securityManager.checkBeforeOperation === 'function' &&
            typeof securityManager.addRandomDelay === 'function') {
            results.securityManager = true;
            console.log('   ✅ 安全管理器初始化成功');
        } else {
            console.log('   ❌ 安全管理器初始化失败');
        }

        // 4. 验证性能监控器
        console.log('\n4. 验证性能监控器...');
        const performanceMonitor = new PerformanceMonitor();
        
        if (performanceMonitor.metrics && performanceMonitor.currentSession &&
            typeof performanceMonitor.recordOperation === 'function' &&
            typeof performanceMonitor.getPerformanceReport === 'function') {
            results.performanceMonitor = true;
            console.log('   ✅ 性能监控器初始化成功');
        } else {
            console.log('   ❌ 性能监控器初始化失败');
        }

        // 5. 验证策略系统
        console.log('\n5. 验证策略系统...');
        
        // 检查默认策略
        const verticalInfiniteStrategy = architecture.getStrategy('scroll', 'vertical-infinite');
        const verticalPaginatedStrategy = architecture.getStrategy('scroll', 'vertical-paginated');
        const gridInfiniteStrategy = architecture.getStrategy('scroll', 'grid-infinite');
        const gridPaginatedStrategy = architecture.getStrategy('scroll', 'grid-paginated');
        
        if (verticalInfiniteStrategy && verticalPaginatedStrategy && 
            gridInfiniteStrategy && gridPaginatedStrategy) {
            results.strategies = true;
            console.log('   ✅ 滚动策略系统正常');
        } else {
            console.log('   ❌ 滚动策略系统异常');
        }

        // 6. 验证插件系统
        console.log('\n6. 验证插件系统...');
        
        try {
            const mockPlugin = {
                initialize: jest.fn(),
                cleanup: jest.fn()
            };
            
            await architecture.registerPlugin('test-plugin', mockPlugin);
            
            if (architecture.plugins.has('test-plugin')) {
                results.plugins = true;
                console.log('   ✅ 插件系统正常');
            } else {
                console.log('   ❌ 插件系统异常');
            }
        } catch (error) {
            console.log('   ❌ 插件系统测试失败:', error.message);
        }

        // 7. 验证配置系统
        console.log('\n7. 验证配置系统...');
        
        try {
            await architecture.loadSiteConfig('weibo');
            
            if (architecture.configurations.has('weibo')) {
                const config = architecture.configurations.get('weibo');
                if (config.site && config.domain && config.requiresAuth) {
                    results.configuration = true;
                    console.log('   ✅ 配置系统正常');
                } else {
                    console.log('   ❌ 配置数据异常');
                }
            } else {
                console.log('   ❌ 配置加载失败');
            }
        } catch (error) {
            console.log('   ❌ 配置系统测试失败:', error.message);
        }

        // 清理资源
        await architecture.cleanup();

    } catch (error) {
        console.error('❌ 架构验证过程中出错:', error.message);
    }

    // 输出验证结果
    console.log('\n📊 验证结果汇总:');
    console.log('=' * 50);
    
    const totalTests = Object.keys(results).length;
    const passedTests = Object.values(results).filter(Boolean).length;
    
    for (const [component, passed] of Object.entries(results)) {
        const status = passed ? '✅' : '❌';
        console.log(`${status} ${component}: ${passed ? '通过' : '失败'}`);
    }
    
    console.log('\n📈 总体结果:');
    console.log(`   通过: ${passedTests}/${totalTests}`);
    console.log(`   成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
        console.log('\n🎉 所有组件验证通过！热插拔架构工作正常。');
        return true;
    } else {
        console.log('\n⚠️ 部分组件验证失败，请检查相关实现。');
        return false;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    validateArchitecture()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ 验证脚本执行失败:', error.message);
            process.exit(1);
        });
}

module.exports = { validateArchitecture };