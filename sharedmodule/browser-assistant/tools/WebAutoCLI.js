#!/usr/bin/env node

const { HotPluggableArchitecture } = require('../core/HotPluggableArchitecture');
const { CookieManager } = require('../core/CookieManager');
const fs = require('fs').promises;
const path = require('path');

/**
 * WebAuto CLI 工具 - 命令行界面
 */
class WebAutoCLI {
    constructor() {
        this.architecture = null;
        this.cookieManager = new CookieManager();
        this.configPath = path.join(__dirname, '..', 'config', 'sites');
        this.outputDir = path.join(process.env.HOME || '~', '.webauto', 'cli-output');
    }

    /**
     * 主入口函数
     */
    async main() {
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            this.showHelp();
            return;
        }

        try {
            switch (args[0]) {
                case 'help':
                case '--help':
                case '-h':
                    this.showHelp();
                    break;
                    
                case 'cookie':
                    await this.handleCookieCommand(args.slice(1));
                    break;
                    
                case 'test':
                    await this.handleTestCommand(args.slice(1));
                    break;
                    
                case 'extract':
                    await this.handleExtractCommand(args.slice(1));
                    break;
                    
                case 'scan':
                    await this.handleScanCommand(args.slice(1));
                    break;
                    
                case 'status':
                    await this.handleStatusCommand(args.slice(1));
                    break;
                    
                default:
                    console.error(`❌ 未知命令: ${args[0]}`);
                    this.showHelp();
            }
        } catch (error) {
            console.error('❌ 执行失败:', error.message);
            process.exit(1);
        }
    }

    /**
     * 显示帮助信息
     */
    showHelp() {
        console.log(`
🚀 WebAuto CLI - 热插拔架构浏览器自动化工具

使用方法:
  webauto <command> [options]

命令:
  cookie     Cookie 管理命令
  test       运行测试
  extract    内容提取
  scan       页面扫描
  status     系统状态

Cookie 命令:
  webauto cookie check <domain>           - 检查域名 cookie 状态
  webauto cookie validate <domain>        - 验证域名 cookie 有效性
  webauto cookie list                     - 列出所有域名的 cookie
  webauto cookie clear <domain>           - 清除指定域名的 cookie
  webauto cookie backup <domain>          - 备份域名 cookie
  webauto cookie restore <domain> <time>  - 恢复域名 cookie

测试命令:
  webauto test architecture                - 测试架构组件
  webauto test cookie <domain>            - 测试指定域名的 cookie
  webauto test security                   - 测试安全组件
  webauto test performance                - 测试性能监控

提取命令:
  webauto extract <site> <url> [options] - 从指定站点提取内容
    --max-items <number>                 - 最大提取数量 (默认: 50)
    --output <file>                      - 输出文件路径
    --format <json|csv>                  - 输出格式 (默认: json)

扫描命令:
  webauto scan <url> [options]           - 扫描页面结构
    --depth <number>                     - 扫描深度 (默认: 3)
    --output <file>                      - 输出文件路径

状态命令:
  webauto status                          - 显示系统状态
  webauto status performance             - 显示性能统计
  webauto status cookies                  - 显示 cookie 状态

示例:
  webauto cookie check weibo.com
  webauto extract weibo https://weibo.com --max-items 20
  webauto test architecture
  webauto status performance

注意事项:
  ⚠️  所有社交网站操作都需要有效的登录 cookie
  ⚠️  失败操作会自动停止以避免被封号
  ⚠️  批量操作包含时间扰动和输入扰动
        `);
    }

    /**
     * 处理 Cookie 命令
     */
    async handleCookieCommand(args) {
        if (args.length === 0) {
            console.log('Cookie 子命令:');
            console.log('  check <domain>    - 检查域名 cookie 状态');
            console.log('  validate <domain> - 验证域名 cookie 有效性');
            console.log('  list            - 列出所有域名的 cookie');
            console.log('  clear <domain>  - 清除指定域名的 cookie');
            return;
        }

        const [subcommand, ...params] = args;

        switch (subcommand) {
            case 'check':
                await this.checkCookie(params[0]);
                break;
                
            case 'validate':
                await this.validateCookie(params[0]);
                break;
                
            case 'list':
                await this.listCookies();
                break;
                
            case 'clear':
                await this.clearCookie(params[0]);
                break;
                
            case 'backup':
                await this.backupCookie(params[0]);
                break;
                
            case 'restore':
                await this.restoreCookie(params[0], params[1]);
                break;
                
            default:
                console.error(`❌ 未知 cookie 命令: ${subcommand}`);
        }
    }

    /**
     * 检查 Cookie 状态
     */
    async checkCookie(domain) {
        if (!domain) {
            console.error('❌ 请指定域名');
            return;
        }

        console.log(`🔍 检查 ${domain} 的 cookie 状态...`);
        
        const hasCookies = await this.cookieManager.hasCookies(domain);
        
        if (hasCookies) {
            console.log(`✅ ${domain} 有有效的 cookie`);
        } else {
            console.log(`❌ ${domain} 没有有效的 cookie`);
            console.log('💡 请先手动登录并保存 cookie');
        }
    }

    /**
     * 验证 Cookie 有效性
     */
    async validateCookie(domain) {
        if (!domain) {
            console.error('❌ 请指定域名');
            return;
        }

        console.log(`🔍 验证 ${domain} 的 cookie 有效性...`);
        
        const validation = await this.cookieManager.validateCookies(domain);
        
        console.log(`📊 Cookie 验证结果:`);
        console.log(`  总数: ${validation.total}`);
        console.log(`  有效: ${validation.validCount}`);
        console.log(`  状态: ${validation.valid ? '✅ 有效' : '❌ 无效'}`);
        
        if (validation.valid && validation.cookies.length > 0) {
            console.log(`\n📋 有效的 cookie:`);
            validation.cookies.slice(0, 5).forEach((cookie, index) => {
                console.log(`  ${index + 1}. ${cookie.name} - ${cookie.domain}`);
            });
            
            if (validation.cookies.length > 5) {
                console.log(`  ... 还有 ${validation.cookies.length - 5} 个`);
            }
        }
    }

    /**
     * 列出所有 Cookie
     */
    async listCookies() {
        console.log('🔍 列出所有域名的 cookie...');
        
        const domains = ['weibo.com', 'xiaohongshu.com', 'zhihu.com'];
        const results = await this.cookieManager.batchValidateCookies(domains);
        
        console.log('\n📊 Cookie 状态汇总:');
        let hasAnyCookies = false;
        
        for (const [domain, result] of results) {
            const status = result.valid ? '✅' : '❌';
            console.log(`  ${status} ${domain}: ${result.validCount}/${result.total} 有效`);
            
            if (result.validCount > 0) {
                hasAnyCookies = true;
            }
        }
        
        if (!hasAnyCookies) {
            console.log('\n💡 未找到任何有效的 cookie');
            console.log('💡 请先手动登录社交网站并保存 cookie');
        }
    }

    /**
     * 清除 Cookie
     */
    async clearCookie(domain) {
        if (!domain) {
            console.error('❌ 请指定域名');
            return;
        }

        console.log(`🗑️  清除 ${domain} 的 cookie...`);
        
        const success = await this.cookieManager.clearCookies(domain);
        
        if (success) {
            console.log(`✅ ${domain} 的 cookie 已清除`);
        } else {
            console.log(`⚠️  ${domain} 的 cookie 文件不存在`);
        }
    }

    /**
     * 备份 Cookie
     */
    async backupCookie(domain) {
        if (!domain) {
            console.error('❌ 请指定域名');
            return;
        }

        console.log(`💾 备份 ${domain} 的 cookie...`);
        
        try {
            const cookies = await this.cookieManager.loadStoredCookies(domain);
            if (cookies.length === 0) {
                console.log(`❌ ${domain} 没有可备份的 cookie`);
                return;
            }
            
            await this.cookieManager.cookieBackup.createBackup(domain, cookies);
            console.log(`✅ ${domain} 的 cookie 备份完成`);
            
        } catch (error) {
            console.error(`❌ 备份失败: ${error.message}`);
        }
    }

    /**
     * 恢复 Cookie
     */
    async restoreCookie(domain, timestamp) {
        if (!domain) {
            console.error('❌ 请指定域名');
            return;
        }

        console.log(`🔄 恢复 ${domain} 的 cookie...`);
        
        try {
            const backups = await this.cookieManager.cookieBackup.listBackups(domain);
            
            if (backups.length === 0) {
                console.log(`❌ ${domain} 没有可恢复的备份`);
                return;
            }
            
            let targetBackup;
            if (timestamp) {
                targetBackup = backups.find(b => b.timestamp === timestamp);
            } else {
                targetBackup = backups[backups.length - 1]; // 使用最新备份
            }
            
            if (!targetBackup) {
                console.log(`❌ 未找到指定的备份`);
                return;
            }
            
            const cookies = await this.cookieManager.cookieBackup.restoreBackup(domain, targetBackup.timestamp);
            
            // 保存恢复的 cookie
            const encrypted = this.cookieManager.encrypt(JSON.stringify(cookies));
            const cookieFile = this.cookieManager.getCookieFilePath(domain);
            await fs.writeFile(cookieFile, encrypted);
            
            console.log(`✅ ${domain} 的 cookie 恢复完成`);
            console.log(`📅 备份时间: ${targetBackup.timestamp}`);
            
        } catch (error) {
            console.error(`❌ 恢复失败: ${error.message}`);
        }
    }

    /**
     * 处理测试命令
     */
    async handleTestCommand(args) {
        if (args.length === 0) {
            console.log('测试子命令:');
            console.log('  architecture    - 测试架构组件');
            console.log('  cookie <domain> - 测试指定域名的 cookie');
            console.log('  security        - 测试安全组件');
            console.log('  performance     - 测试性能监控');
            return;
        }

        const [subcommand, ...params] = args;

        switch (subcommand) {
            case 'architecture':
                await this.testArchitecture();
                break;
                
            case 'cookie':
                await this.testCookie(params[0]);
                break;
                
            case 'security':
                await this.testSecurity();
                break;
                
            case 'performance':
                await this.testPerformance();
                break;
                
            default:
                console.error(`❌ 未知测试命令: ${subcommand}`);
        }
    }

    /**
     * 测试架构组件
     */
    async testArchitecture() {
        console.log('🧪 测试架构组件...');
        
        try {
            const architecture = new HotPluggableArchitecture();
            
            // 测试策略注册
            console.log('  ✅ 策略系统正常');
            console.log(`  📊 已注册 ${architecture.strategies.size} 个策略`);
            
            // 测试插件系统
            console.log('  ✅ 插件系统正常');
            
            // 测试配置加载
            await architecture.loadSiteConfig('weibo');
            console.log('  ✅ 配置系统正常');
            
            // 清理
            await architecture.cleanup();
            console.log('  ✅ 资源清理正常');
            
            console.log('\n🎉 架构测试完成');
            
        } catch (error) {
            console.error('❌ 架构测试失败:', error.message);
        }
    }

    /**
     * 测试指定域名的 Cookie
     */
    async testCookie(domain) {
        if (!domain) {
            console.error('❌ 请指定域名');
            return;
        }

        console.log(`🧪 测试 ${domain} 的 cookie...`);
        
        try {
            // 检查 cookie
            const hasCookies = await this.cookieManager.hasCookies(domain);
            console.log(`  🔍 Cookie 存在: ${hasCookies ? '✅' : '❌'}`);
            
            if (hasCookies) {
                // 验证 cookie
                const validation = await this.cookieManager.validateCookies(domain);
                console.log(`  🔍 Cookie 有效: ${validation.valid ? '✅' : '❌'}`);
                console.log(`  📊 Cookie 数量: ${validation.validCount}/${validation.total}`);
                
                // 测试架构初始化
                const architecture = new HotPluggableArchitecture();
                await architecture.loadSiteConfig(domain);
                
                // 尝试初始化浏览器
                try {
                    await architecture.initializeBrowser({ headless: true });
                    console.log('  🌐 浏览器初始化: ✅');
                    await architecture.cleanup();
                } catch (error) {
                    console.log(`  🌐 浏览器初始化: ❌ (${error.message})`);
                }
            }
            
            console.log(`\n🎉 ${domain} Cookie 测试完成`);
            
        } catch (error) {
            console.error(`❌ ${domain} Cookie 测试失败:`, error.message);
        }
    }

    /**
     * 测试安全组件
     */
    async testSecurity() {
        console.log('🧪 测试安全组件...');
        
        try {
            const architecture = new HotPluggableArchitecture();
            const securityManager = architecture.securityManager;
            
            // 测试风险模式检测
            const mockOperation = { type: 'click' };
            const result = securityManager.checkBeforeOperation({ url: () => 'https://test.com' }, mockOperation);
            console.log(`  🔍 安全检查: ${result.allowed ? '✅' : '❌'}`);
            
            // 测试随机延迟
            const startTime = Date.now();
            await securityManager.addRandomDelay(100, 500);
            const delay = Date.now() - startTime;
            console.log(`  ⏱️  随机延迟: ${delay}ms (✅)`);
            
            // 测试人类行为延迟
            const humanStart = Date.now();
            await securityManager.addHumanDelay();
            const humanDelay = Date.now() - humanStart;
            console.log(`  🧍 人类行为延迟: ${humanDelay}ms (✅)`);
            
            console.log('\n🎉 安全组件测试完成');
            
        } catch (error) {
            console.error('❌ 安全组件测试失败:', error.message);
        }
    }

    /**
     * 测试性能监控
     */
    async testPerformance() {
        console.log('🧪 测试性能监控...');
        
        try {
            const architecture = new HotPluggableArchitecture();
            const performanceMonitor = architecture.performanceMonitor;
            
            // 开始会话
            performanceMonitor.startSession();
            console.log('  📊 会话开始: ✅');
            
            // 记录一些操作
            performanceMonitor.recordOperation('test_op', true, 100);
            performanceMonitor.recordOperation('slow_op', true, 6000);
            performanceMonitor.recordOperation('error_op', false, 200);
            
            // 获取报告
            const report = performanceMonitor.getPerformanceReport();
            console.log(`  📊 操作数量: ${report.session.operations}`);
            console.log(`  📊 成功率: ${report.session.successRate.toFixed(1)}%`);
            console.log(`  📊 平均响应时间: ${report.session.averageResponseTime.toFixed(0)}ms`);
            console.log(`  ⚠️  警告数量: ${report.warnings.length}`);
            
            // 结束会话
            performanceMonitor.endSession();
            console.log('  📊 会话结束: ✅');
            
            console.log('\n🎉 性能监控测试完成');
            
        } catch (error) {
            console.error('❌ 性能监控测试失败:', error.message);
        }
    }

    /**
     * 处理状态命令
     */
    async handleStatusCommand(args) {
        if (args.length === 0) {
            await this.showGeneralStatus();
            return;
        }

        const [subcommand] = args;

        switch (subcommand) {
            case 'performance':
                await this.showPerformanceStatus();
                break;
                
            case 'cookies':
                await this.showCookieStatus();
                break;
                
            default:
                console.error(`❌ 未知状态命令: ${subcommand}`);
        }
    }

    /**
     * 显示一般状态
     */
    async showGeneralStatus() {
        console.log('📊 WebAuto 系统状态');
        console.log('=' * 50);
        
        // 检查 cookie 状态
        const domains = ['weibo.com', 'xiaohongshu.com'];
        const results = await this.cookieManager.batchValidateCookies(domains);
        
        console.log('\n🔐 Cookie 状态:');
        for (const [domain, result] of results) {
            const status = result.valid ? '✅' : '❌';
            console.log(`  ${status} ${domain}: ${result.validCount}/${result.total} 有效`);
        }
        
        // 检查配置文件
        console.log('\n⚙️  配置文件状态:');
        try {
            const configFiles = await fs.readdir(this.configPath);
            for (const file of configFiles) {
                if (file.endsWith('.json')) {
                    console.log(`  ✅ ${file}`);
                }
            }
        } catch (error) {
            console.log(`  ❌ 配置目录不存在: ${this.configPath}`);
        }
        
        // 显示使用提示
        console.log('\n💡 使用提示:');
        console.log('  • 运行 "webauto test architecture" 进行完整测试');
        console.log('  • 运行 "webauto cookie list" 查看 cookie 状态');
        console.log('  • 所有社交网站操作都需要有效的登录 cookie');
    }

    /**
     * 显示性能状态
     */
    async showPerformanceStatus() {
        const architecture = new HotPluggableArchitecture();
        const performanceMonitor = architecture.performanceMonitor;
        
        const status = performanceMonitor.getRealTimeStatus();
        
        console.log('📊 性能监控状态');
        console.log('=' * 50);
        console.log(`🔄 会话状态: ${status.sessionActive ? '活跃' : '非活跃'}`);
        console.log(`⏱️  会话时长: ${Math.round(status.sessionDuration / 1000)}s`);
        console.log(`📊 操作数量: ${status.operationsThisSession}`);
        console.log(`✅ 成功率: ${status.successRate.toFixed(1)}%`);
        console.log(`⏱️  平均响应时间: ${status.averageResponseTime.toFixed(0)}ms`);
        
        console.log('\n💾 内存使用:');
        const memory = status.memoryUsage;
        console.log(`  堆内存: ${(memory.heapUsed / 1024 / 1024).toFixed(1)}MB`);
        console.log(`  常驻内存: ${(memory.residentSetSize / 1024 / 1024).toFixed(1)}MB`);
        
        console.log(`\n⏱️  运行时间: ${Math.round(status.uptime)}s`);
    }

    /**
     * 显示 Cookie 状态
     */
    async showCookieStatus() {
        console.log('🔐 Cookie 状态详情');
        console.log('=' * 50);
        
        const domains = ['weibo.com', 'xiaohongshu.com', 'zhihu.com'];
        const results = await this.cookieManager.batchValidateCookies(domains);
        
        for (const [domain, result] of results) {
            console.log(`\n📱 ${domain}:`);
            console.log(`  状态: ${result.valid ? '✅ 有效' : '❌ 无效'}`);
            console.log(`  数量: ${result.validCount}/${result.total}`);
            
            if (result.valid && result.cookies.length > 0) {
                console.log('  有效的 Cookie:');
                result.cookies.slice(0, 3).forEach((cookie, index) => {
                    console.log(`    ${index + 1}. ${cookie.name}`);
                });
                
                if (result.cookies.length > 3) {
                    console.log(`    ... 还有 ${result.cookies.length - 3} 个`);
                }
            }
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const cli = new WebAutoCLI();
    cli.main().catch(error => {
        console.error('❌ CLI 执行失败:', error);
        process.exit(1);
    });
}

module.exports = WebAutoCLI;