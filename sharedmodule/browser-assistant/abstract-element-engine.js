const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

/**
 * 抽象元素引擎 - 基于JSON配置的统一元素定位和操作系统
 */
class AbstractElementEngine {
    constructor(configPath) {
        this.config = null;
        this.configPath = configPath;
        this.page = null;
        this.context = null;
        this.browser = null;
        this.results = {
            url: '',
            metadata: {},
            pageInfo: {},
            extractedData: [],
            actions: [],
            errors: [],
            startTime: '',
            endTime: '',
            performance: {
                totalActions: 0,
                successfulActions: 0,
                failedActions: 0,
                totalTime: 0
            }
        };
    }

    /**
     * 加载配置文件
     */
    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
            console.log(`✅ 配置加载成功: ${this.config.meta.name} v${this.config.meta.version}`);
            return true;
        } catch (error) {
            console.error('❌ 配置加载失败:', error.message);
            return false;
        }
    }

    /**
     * 初始化浏览器
     */
    async initialize(options = {}) {
        if (!await this.loadConfig()) {
            throw new Error('配置加载失败');
        }

        this.results.startTime = new Date().toISOString();
        this.results.metadata = {
            config: this.config.meta,
            options: options
        };

        console.log('🚀 初始化抽象元素引擎...');
        
        this.browser = await chromium.launch({ 
            headless: options.headless || false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();
        
        // 设置超时
        this.page.setDefaultTimeout(this.config.errorHandling.timeout);
        this.page.setDefaultNavigationTimeout(this.config.errorHandling.timeout);
        
        console.log('✅ 引擎初始化完成');
        return true;
    }

    /**
     * 导航到目标页面
     */
    async navigateTo(url) {
        console.log('📍 导航到目标页面...');
        
        try {
            // 加载cookie
            await this.loadCookies();
            
            // 导航到页面
            await this.page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: this.config.errorHandling.timeout 
            });
            
            this.results.url = url;
            
            // 提取页面基本信息
            await this.extractPageInfo();
            
            console.log('✅ 页面导航完成');
            return true;
        } catch (error) {
            console.error('❌ 页面导航失败:', error.message);
            this.results.errors.push({
                type: 'navigation',
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }

    /**
     * 加载Cookie
     */
    async loadCookies() {
        const cookiePaths = [
            path.join(process.env.HOME, '.webauto', 'weibo_cookies.json'),
            path.join(process.env.HOME, '.webauto', 'cookies', 'weibo.json'),
            path.join(process.env.HOME, '.config', 'webauto', 'cookies', 'weibo.json')
        ];
        
        for (const cookiePath of cookiePaths) {
            try {
                const cookieData = await fs.readFile(cookiePath, 'utf8');
                const cookies = JSON.parse(cookieData);
                await this.context.addCookies(cookies);
                console.log(`✅ 已加载cookie: ${cookiePath}`);
                return true;
            } catch (e) {
                // 继续尝试下一个路径
            }
        }
        
        console.log('⚠️ 未找到cookie文件');
        return false;
    }

    /**
     * 提取页面基本信息
     */
    async extractPageInfo() {
        const pageInfo = {};
        
        for (const [key, elementConfig] of Object.entries(this.config.abstractElements.page)) {
            try {
                const value = await this.extractElement(elementConfig);
                pageInfo[key] = value;
            } catch (error) {
                console.log(`⚠️ 提取 ${key} 失败:`, error.message);
                pageInfo[key] = null;
            }
        }
        
        this.results.pageInfo = pageInfo;
        console.log(`📝 页面信息: ${pageInfo.author} - ${pageInfo.title}`);
    }

    /**
     * 提取单个元素
     */
    async extractElement(elementConfig) {
        const selectors = Array.isArray(elementConfig.selector) ? elementConfig.selector : [elementConfig.selector];
        
        for (const selector of selectors) {
            try {
                const result = await this.page.evaluate((sel, config) => {
                    const element = document.querySelector(sel);
                    if (!element) return null;
                    
                    switch (config.type) {
                        case 'text':
                            return element.textContent?.trim() || '';
                        case 'attribute':
                            return element.getAttribute(config.attribute) || '';
                        case 'number':
                            const text = element.textContent?.trim() || '';
                            const number = parseInt(text.replace(/[^\d]/g, '')) || 0;
                            return number;
                        case 'element':
                            return element ? true : false;
                        default:
                            return element.textContent?.trim() || '';
                    }
                }, selector, elementConfig);
                
                if (result !== null && result !== '') {
                    return result;
                }
            } catch (error) {
                // 继续尝试下一个选择器
            }
        }
        
        return null;
    }

    /**
     * 执行动作
     */
    async executeAction(actionName, options = {}) {
        const actionConfig = this.config.actions[actionName];
        if (!actionConfig) {
            throw new Error(`未找到动作: ${actionName}`);
        }
        
        console.log(`🎯 执行动作: ${actionConfig.name}`);
        
        const actionStart = Date.now();
        let success = false;
        
        try {
            switch (actionConfig.type) {
                case 'sequential':
                    success = await this.executeSequentialAction(actionConfig, options);
                    break;
                case 'scroll':
                    success = await this.executeScrollAction(actionConfig, options);
                    break;
                case 'extraction':
                    success = await this.executeExtractionAction(actionConfig, options);
                    break;
                default:
                    throw new Error(`不支持的动作类型: ${actionConfig.type}`);
            }
            
            const duration = Date.now() - actionStart;
            this.results.actions.push({
                name: actionName,
                config: actionConfig,
                success,
                duration,
                timestamp: new Date().toISOString()
            });
            
            if (success) {
                this.results.performance.successfulActions++;
                console.log(`✅ 动作完成: ${actionConfig.name} (${duration}ms)`);
            } else {
                this.results.performance.failedActions++;
                console.log(`❌ 动作失败: ${actionConfig.name}`);
            }
            
            this.results.performance.totalActions++;
            
            return success;
        } catch (error) {
            const duration = Date.now() - actionStart;
            this.results.errors.push({
                type: 'action',
                action: actionName,
                message: error.message,
                timestamp: new Date().toISOString()
            });
            
            this.results.actions.push({
                name: actionName,
                config: actionConfig,
                success: false,
                duration,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            this.results.performance.totalActions++;
            this.results.performance.failedActions++;
            
            console.error(`❌ 动作执行失败: ${actionConfig.name}`, error.message);
            return false;
        }
    }

    /**
     * 执行顺序动作
     */
    async executeSequentialAction(actionConfig, options = {}) {
        const elements = actionConfig.elements || [];
        let totalClicked = 0;
        const maxAttempts = options.maxAttempts || actionConfig.maxAttempts || 10;
        
        for (const elementRef of elements) {
            const elementConfig = this.getElementConfig(elementRef);
            if (!elementConfig) {
                console.log(`⚠️ 未找到元素配置: ${elementRef}`);
                continue;
            }
            
            const selectors = Array.isArray(elementConfig.selector) ? elementConfig.selector : [elementConfig.selector];
            
            for (const selector of selectors) {
                try {
                    const elements = await this.page.$$(selector);
                    
                    for (const element of elements) {
                        if (totalClicked >= maxAttempts) break;
                        
                        try {
                            await element.click();
                            totalClicked++;
                            console.log(`  点击元素 (${selector})`);
                            await this.page.waitForTimeout(actionConfig.waitTime || 1000);
                        } catch (e) {
                            // 忽略点击错误
                        }
                    }
                    
                    if (totalClicked >= maxAttempts) break;
                } catch (e) {
                    // 忽略选择器错误
                }
                
                if (totalClicked >= maxAttempts) break;
            }
            
            if (totalClicked >= maxAttempts) break;
        }
        
        return totalClicked > 0;
    }

    /**
     * 执行滚动动作
     */
    async executeScrollAction(actionConfig, options = {}) {
        const scrollCount = options.scrollCount || actionConfig.scrollCount || 5;
        const scrollInterval = options.scrollInterval || actionConfig.scrollInterval || 2000;
        const scrollTo = options.scrollTo || actionConfig.scrollTo || 'bottom';
        
        for (let i = 0; i < scrollCount; i++) {
            await this.page.evaluate((target) => {
                if (target === 'bottom') {
                    window.scrollTo(0, document.body.scrollHeight);
                } else if (target === 'top') {
                    window.scrollTo(0, 0);
                }
            }, scrollTo);
            
            console.log(`  滚动 ${i + 1}/${scrollCount} (${scrollTo})`);
            await this.page.waitForTimeout(scrollInterval);
        }
        
        return true;
    }

    /**
     * 执行提取动作
     */
    async executeExtractionAction(actionConfig, options = {}) {
        const containerConfig = this.getElementConfig(actionConfig.container);
        const templateConfig = this.getElementConfig(actionConfig.template);
        
        if (!containerConfig || !templateConfig) {
            console.log(`⚠️ 未找到容器或模板配置`);
            return false;
        }
        
        const extractedData = await this.extractStructuredData(containerConfig, templateConfig);
        this.results.extractedData.push(...extractedData);
        
        console.log(`📊 提取了 ${extractedData.length} 条数据`);
        return extractedData.length > 0;
    }

    /**
     * 提取结构化数据
     */
    async extractStructuredData(containerConfig, templateConfig) {
        const selectors = Array.isArray(containerConfig.selector) ? containerConfig.selector : [containerConfig.selector];
        let allData = [];
        
        for (const selector of selectors) {
            try {
                const data = await this.page.evaluate((config) => {
                    const containers = document.querySelectorAll(config.selector);
                    const results = [];
                    
                    containers.forEach((container, index) => {
                        const text = container.textContent || '';
                        const rect = container.getBoundingClientRect();
                        
                        // 应用过滤器
                        if (config.filters) {
                            if (rect.width < config.filters.minWidth || rect.height < config.filters.minHeight) return;
                            if (text.length < config.filters.minTextLength || text.length > config.filters.maxTextLength) return;
                            
                            const hasExcludeKeyword = config.filters.excludeKeywords.some(keyword => 
                                text.includes(keyword)
                            );
                            if (hasExcludeKeyword) return;
                            
                            if (config.filters.requireColon && !text.includes(':')) return;
                        }
                        
                        // 提取字段
                        const item = { id: `${config.selector}_${index}` };
                        
                        for (const [fieldName, fieldConfig] of Object.entries(config.template.fields)) {
                            try {
                                const element = container.querySelector(fieldConfig.selector);
                                if (element) {
                                    switch (fieldConfig.type) {
                                        case 'text':
                                            item[fieldName] = element.textContent?.trim() || '';
                                            break;
                                        case 'attribute':
                                            item[fieldName] = element.getAttribute(fieldConfig.attribute) || '';
                                            break;
                                        case 'number':
                                            const text = element.textContent?.trim() || '';
                                            item[fieldName] = parseInt(text.replace(/[^\d]/g, '')) || 0;
                                            break;
                                        case 'element':
                                            item[fieldName] = element ? true : false;
                                            break;
                                        default:
                                            item[fieldName] = element.textContent?.trim() || '';
                                    }
                                } else {
                                    item[fieldName] = fieldConfig.type === 'number' ? 0 : '';
                                }
                            } catch (e) {
                                item[fieldName] = fieldConfig.type === 'number' ? 0 : '';
                            }
                        }
                        
                        // 验证数据
                        if (config.template.validation) {
                            const hasRequiredFields = config.template.validation.requiredFields.every(field => 
                                item[field] && item[field].toString().length > 0
                            );
                            
                            if (!hasRequiredFields) return;
                            
                            if (config.template.validation.contentPattern && 
                                !new RegExp(config.template.validation.contentPattern).test(item.content || '')) {
                                return;
                            }
                        }
                        
                        results.push(item);
                    });
                    
                    return results;
                }, { selector, template: templateConfig, filters: templateConfig.filters });
                
                allData.push(...data);
                console.log(`  选择器 "${selector}": ${data.length} 条`);
                
            } catch (error) {
                console.log(`  选择器错误: ${error.message}`);
            }
        }
        
        return allData;
    }

    /**
     * 获取元素配置
     */
    getElementConfig(elementRef) {
        const parts = elementRef.split('.');
        let current = this.config.abstractElements;
        
        for (const part of parts) {
            if (current[part]) {
                current = current[part];
            } else {
                return null;
            }
        }
        
        return current;
    }

    /**
     * 执行工作流
     */
    async executeWorkflow(workflowName, options = {}) {
        const workflowConfig = this.config.workflows[workflowName];
        if (!workflowConfig) {
            throw new Error(`未找到工作流: ${workflowName}`);
        }
        
        console.log(`🔄 执行工作流: ${workflowConfig.name}`);
        
        let workflowSuccess = true;
        
        for (const stepConfig of workflowConfig.steps) {
            const stepStart = Date.now();
            
            try {
                let stepSuccess = false;
                let attemptCount = 0;
                const maxAttempts = stepConfig.maxRepeats || 1;
                
                do {
                    stepSuccess = await this.executeAction(stepConfig.action, stepConfig.options || {});
                    attemptCount++;
                    
                    if (!stepSuccess && attemptCount < maxAttempts) {
                        console.log(`  步骤失败，重试 ${attemptCount}/${maxAttempts}`);
                        await this.page.waitForTimeout(2000);
                    }
                } while (!stepSuccess && attemptCount < maxAttempts && stepConfig.repeat);
                
                if (!stepSuccess && stepConfig.required) {
                    workflowSuccess = false;
                    console.log(`❌ 必需步骤失败: ${stepConfig.action}`);
                    break;
                }
                
                const stepDuration = Date.now() - stepStart;
                console.log(`  步骤完成: ${stepConfig.action} (${stepDuration}ms)`);
                
            } catch (error) {
                console.error(`❌ 步骤执行错误: ${stepConfig.action}`, error.message);
                if (stepConfig.required) {
                    workflowSuccess = false;
                    break;
                }
            }
        }
        
        console.log(`🎯 工作流完成: ${workflowConfig.name} - ${workflowSuccess ? '成功' : '失败'}`);
        return workflowSuccess;
    }

    /**
     * 保存结果
     */
    async saveResults() {
        this.results.endTime = new Date().toISOString();
        this.results.performance.totalTime = 
            new Date(this.results.endTime) - new Date(this.results.startTime);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseDir = '/Users/fanzhang/.webauto/abstract-results';
        
        await fs.mkdir(baseDir, { recursive: true });
        
        const dataPath = path.join(baseDir, `abstract-result-${timestamp}.json`);
        const reportPath = path.join(baseDir, `abstract-result-${timestamp}.md`);
        
        // 保存JSON数据
        await fs.writeFile(dataPath, JSON.stringify(this.results, null, 2), 'utf8');
        
        // 生成报告
        const duration = this.results.performance.totalTime / 1000;
        const content = `# 抽象元素引擎提取报告

## 📊 基本信息
- **引擎版本:** ${this.config.meta.name} v${this.config.meta.version}
- **目标页面:** ${this.results.url}
- **执行时间:** ${new Date(this.results.startTime).toLocaleString()}
- **处理耗时:** ${duration.toFixed(1)} 秒
- **提取数据量:** ${this.results.extractedData.length} 条

## 📝 页面信息
- **标题:** ${this.results.pageInfo.title || '未知'}
- **作者:** ${this.results.pageInfo.author || '未知'}
- **发布时间:** ${this.results.pageInfo.publishTime || '未知'}

## 🎯 执行统计
- **总动作数:** ${this.results.performance.totalActions}
- **成功动作:** ${this.results.performance.successfulActions}
- **失败动作:** ${this.results.performance.failedActions}
- **成功率:** ${((this.results.performance.successfulActions / Math.max(1, this.results.performance.totalActions)) * 100).toFixed(1)}%

## ⚙️ 性能指标
- **平均动作耗时:** ${(this.results.performance.totalTime / Math.max(1, this.results.performance.totalActions)).toFixed(0)}ms
- **处理速度:** ${(this.results.extractedData.length / duration).toFixed(2)} 条/秒

## 💬 提取内容 (${this.results.extractedData.length} 条)

${this.results.extractedData.slice(0, 20).map((item, index) => `
### ${index + 1}. ${item.author || '未知用户'}

**时间:** ${item.publishTime || '未知'}
**内容:** ${item.content || '无内容'}
**点赞:** ${item.likes || 0}

---
`).join('')}

${this.results.extractedData.length > 20 ? `
... 还有 ${this.results.extractedData.length - 20} 条内容 ...
` : ''}

## 📋 动作执行记录

${this.results.actions.map(action => `
- **${action.name}**: ${action.success ? '✅' : '❌'} (${action.duration}ms)
${action.error ? `  错误: ${action.error}` : ''}
`).join('')}

---

**生成时间:** ${new Date().toLocaleString()}
**工具:** 抽象元素引擎 v1.0
`;
        
        await fs.writeFile(reportPath, content, 'utf8');
        
        console.log(`📄 结果报告: ${reportPath}`);
        console.log(`📄 原始数据: ${dataPath}`);
        
        return { reportPath, dataPath };
    }

    /**
     * 关闭引擎
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 引擎已关闭');
        }
    }
}

// 导出类
module.exports = AbstractElementEngine;

// 如果直接运行此文件，执行测试
if (require.main === module) {
    async function test() {
        const engine = new AbstractElementEngine(
            '/Users/fanzhang/Documents/github/webauto/sharedmodule/browser-assistant/config/abstract-weibo-config.json'
        );
        
        try {
            await engine.initialize({ headless: false });
            await engine.navigateTo('https://weibo.com/2174585797/Q4fZgwfSy');
            
            // 执行评论提取工作流
            await engine.executeWorkflow('commentExtraction');
            
            // 保存结果
            await engine.saveResults();
            
            console.log('🎉 抽象元素引擎测试完成！');
            console.log(`📊 提取了 ${engine.results.extractedData.length} 条评论`);
            
        } catch (error) {
            console.error('❌ 测试失败:', error);
        } finally {
            await engine.close();
        }
    }
    
    test();
}