/**
 * 安全管理器 - 防止封号和异常检测
 */
class SecurityManager {
    constructor() {
        this.operationHistory = [];
        this.domainStatistics = new Map();
        this.blockedDomains = new Set();
        this.riskPatterns = new Map();
        this.rateLimiter = new RateLimiter();
        this.behaviorSimulator = new BehaviorSimulator();
        
        this.initializeRiskPatterns();
    }

    /**
     * 初始化风险模式
     */
    initializeRiskPatterns() {
        // 高风险操作模式
        this.riskPatterns.set('rapid_clicks', {
            threshold: 5,
            timeWindow: 1000,
            severity: 'high'
        });
        
        this.riskPatterns.set('rapid_navigation', {
            threshold: 3,
            timeWindow: 5000,
            severity: 'high'
        });
        
        this.riskPatterns.set('rapid_scrolling', {
            threshold: 10,
            timeWindow: 10000,
            severity: 'medium'
        });
        
        this.riskPatterns.set('consecutive_errors', {
            threshold: 3,
            timeWindow: 30000,
            severity: 'high'
        });
    }

    /**
     * 操作前安全检查
     */
    async checkBeforeOperation(page, operation) {
        const domain = this.extractDomain(page.url());
        
        // 检查域名是否被封
        if (this.blockedDomains.has(domain)) {
            return {
                allowed: false,
                reason: `域名 ${domain} 已被临时阻止`
            };
        }

        // 检查速率限制
        const rateCheck = this.rateLimiter.checkRate(domain, operation.type);
        if (!rateCheck.allowed) {
            return {
                allowed: false,
                reason: `操作过于频繁: ${rateCheck.reason}`
            };
        }

        // 检查风险模式
        const riskCheck = this.checkRiskPatterns(operation);
        if (!riskCheck.allowed) {
            return {
                allowed: false,
                reason: `检测到风险模式: ${riskCheck.reason}`
            };
        }

        // 检查域名统计
        const statsCheck = this.checkDomainStatistics(domain, operation);
        if (!statsCheck.allowed) {
            return {
                allowed: false,
                reason: `域名统计异常: ${statsCheck.reason}`
            };
        }

        // 检查页面状态
        const pageCheck = await this.checkPageState(page);
        if (!pageCheck.allowed) {
            return {
                allowed: false,
                reason: `页面状态异常: ${pageCheck.reason}`
            };
        }

        return {
            allowed: true,
            domain: domain,
            recommendations: this.generateRecommendations(operation)
        };
    }

    /**
     * 处理操作错误
     */
    async handleOperationError(page, operation, error) {
        const domain = this.extractDomain(page.url());
        
        // 记录错误
        this.recordError(domain, operation, error);
        
        // 检查是否需要阻止域名
        const shouldBlock = this.shouldBlockDomain(domain);
        if (shouldBlock) {
            this.blockedDomains.add(domain);
            console.error(`🚫 域名已被临时阻止: ${domain}`);
            
            // 设置自动解封时间
            setTimeout(() => {
                this.blockedDomains.delete(domain);
                console.log(`✅ 域名解封: ${domain}`);
            }, 30 * 60 * 1000); // 30分钟后解封
        }
        
        // 根据错误类型调整策略
        await this.adjustStrategyOnError(domain, operation, error);
        
        // 记录异常行为
        this.behaviorSimulator.recordAbnormalBehavior(domain, operation, error);
    }

    /**
     * 添加随机延迟 - 时间扰动
     */
    async addRandomDelay(minMs, maxMs) {
        const delay = Math.random() * (maxMs - minMs) + minMs;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // 记录延迟
        this.behaviorSimulator.recordDelay(delay);
        
        return delay;
    }

    /**
     * 添加人类行为模拟延迟
     */
    async addHumanDelay() {
        // 人类操作延迟分布
        const humanDelays = [
            { min: 100, max: 300, weight: 0.4 },     // 快速点击
            { min: 300, max: 800, weight: 0.3 },     // 正常操作
            { min: 800, max: 2000, weight: 0.2 },    // 思考时间
            { min: 2000, max: 5000, weight: 0.1 }    // 长时间思考
        ];
        
        const delay = this.weightedRandom(humanDelays);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return delay;
    }

    /**
     * 模拟人类输入
     */
    async simulateHumanInput(page, selector, text, options = {}) {
        const element = await page.$(selector);
        if (!element) {
            throw new Error(`Element not found: ${selector}`);
        }

        // 点击输入框
        await element.click();
        await this.addHumanDelay();

        // 清空输入框
        await element.fill('');
        await this.addRandomDelay(50, 200);

        // 模拟打字
        const chunks = this.splitTextIntoChunks(text);
        for (const chunk of chunks) {
            await element.type(chunk, { delay: this.generateTypingDelay() });
            await this.addRandomDelay(100, 500);
        }

        // 随机移动鼠标
        await this.simulateRandomMouseMovement(page);
    }

    /**
     * 生成打字延迟
     */
    generateTypingDelay() {
        // 人类打字速度分布
        const typingSpeeds = [
            { min: 50, max: 100, weight: 0.2 },    // 快速打字
            { min: 100, max: 200, weight: 0.5 },   // 正常打字
            { min: 200, max: 400, weight: 0.2 },   // 慢速打字
            { min: 400, max: 800, weight: 0.1 }    // 很慢打字
        ];
        
        return this.weightedRandom(typingSpeeds);
    }

    /**
     * 模拟随机鼠标移动
     */
    async simulateRandomMouseMovement(page) {
        const viewport = await page.viewportSize();
        const moves = Math.floor(Math.random() * 3) + 1; // 1-3次移动
        
        for (let i = 0; i < moves; i++) {
            const x = Math.random() * viewport.width;
            const y = Math.random() * viewport.height;
            
            await page.mouse.move(x, y, {
                steps: Math.floor(Math.random() * 10) + 5
            });
            
            await this.addRandomDelay(50, 200);
        }
    }

    /**
     * 检查风险模式
     */
    checkRiskPatterns(operation) {
        const now = Date.now();
        const recentOperations = this.operationHistory.filter(
            op => now - op.timestamp < this.riskPatterns.get('rapid_clicks').timeWindow
        );

        // 检查快速点击
        if (operation.type === 'click') {
            const recentClicks = recentOperations.filter(op => op.type === 'click');
            if (recentClicks.length >= this.riskPatterns.get('rapid_clicks').threshold) {
                return {
                    allowed: false,
                    reason: '检测到快速点击模式'
                };
            }
        }

        // 检查快速导航
        if (operation.type === 'navigate') {
            const recentNavs = recentOperations.filter(op => op.type === 'navigate');
            if (recentNavs.length >= this.riskPatterns.get('rapid_navigation').threshold) {
                return {
                    allowed: false,
                    reason: '检测到快速导航模式'
                };
            }
        }

        // 检查连续错误
        const recentErrors = recentOperations.filter(op => op.error);
        if (recentErrors.length >= this.riskPatterns.get('consecutive_errors').threshold) {
            return {
                allowed: false,
                reason: '检测到连续错误'
            };
        }

        return { allowed: true };
    }

    /**
     * 检查域名统计
     */
    checkDomainStatistics(domain, operation) {
        if (!this.domainStatistics.has(domain)) {
            this.domainStatistics.set(domain, {
                operations: 0,
                errors: 0,
                lastOperation: 0,
                operationTypes: new Map()
            });
        }

        const stats = this.domainStatistics.get(domain);
        const now = Date.now();

        // 检查操作频率
        if (now - stats.lastOperation < 1000) {
            return {
                allowed: false,
                reason: '域名操作过于频繁'
            };
        }

        // 检查错误率
        const errorRate = stats.errors / Math.max(stats.operations, 1);
        if (errorRate > 0.5) {
            return {
                allowed: false,
                reason: '域名错误率过高'
            };
        }

        return { allowed: true };
    }

    /**
     * 检查页面状态
     */
    async checkPageState(page) {
        try {
            // 检查是否被重定向到登录页面
            const currentUrl = page.url();
            if (currentUrl.includes('login') || currentUrl.includes('signin')) {
                return {
                    allowed: false,
                    reason: '被重定向到登录页面'
                };
            }

            // 检查是否有验证码
            const hasCaptcha = await page.$('img[src*="captcha"], .captcha, .verification-code');
            if (hasCaptcha) {
                return {
                    allowed: false,
                    reason: '检测到验证码'
                };
            }

            // 检查是否有错误提示
            const hasError = await page.$('.error, .alert-error, .warning');
            if (hasError) {
                return {
                    allowed: false,
                    reason: '检测到错误提示'
                };
            }

            return { allowed: true };
        } catch (error) {
            return {
                allowed: false,
                reason: `页面状态检查失败: ${error.message}`
            };
        }
    }

    /**
     * 记录操作
     */
    recordOperation(domain, operation, result = null) {
        this.operationHistory.push({
            domain,
            type: operation.type,
            timestamp: Date.now(),
            result,
            error: result instanceof Error ? result : null
        });

        // 更新域名统计
        if (this.domainStatistics.has(domain)) {
            const stats = this.domainStatistics.get(domain);
            stats.operations++;
            stats.lastOperation = Date.now();
            
            if (operation.type) {
                const typeCount = stats.operationTypes.get(operation.type) || 0;
                stats.operationTypes.set(operation.type, typeCount + 1);
            }
        }

        // 限制历史记录长度
        if (this.operationHistory.length > 1000) {
            this.operationHistory = this.operationHistory.slice(-500);
        }
    }

    /**
     * 记录错误
     */
    recordError(domain, operation, error) {
        this.recordOperation(domain, operation, error);

        if (this.domainStatistics.has(domain)) {
            const stats = this.domainStatistics.get(domain);
            stats.errors++;
        }
    }

    /**
     * 判断是否应该阻止域名
     */
    shouldBlockDomain(domain) {
        if (!this.domainStatistics.has(domain)) {
            return false;
        }

        const stats = this.domainStatistics.get(domain);
        const errorRate = stats.errors / Math.max(stats.operations, 1);
        
        return errorRate > 0.7 || stats.errors > 10;
    }

    /**
     * 生成安全建议
     */
    generateRecommendations(operation) {
        const recommendations = [];
        
        // 基于操作类型的建议
        switch (operation.type) {
            case 'click':
                recommendations.push('建议添加随机延迟');
                break;
            case 'navigate':
                recommendations.push('建议等待页面完全加载');
                break;
            case 'scroll':
                recommendations.push('建议使用渐进式滚动');
                break;
        }

        // 基于历史行为的建议
        if (this.operationHistory.length > 10) {
            recommendations.push('建议定期清理浏览器缓存');
        }

        return recommendations;
    }

    /**
     * 工具方法
     */
    extractDomain(url) {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return 'unknown';
        }
    }

    weightedRandom(items) {
        const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const item of items) {
            random -= item.weight;
            if (random <= 0) {
                return Math.random() * (item.max - item.min) + item.min;
            }
        }
        
        return items[0].min;
    }

    splitTextIntoChunks(text) {
        const chunks = [];
        const chunkSize = Math.floor(Math.random() * 3) + 1; // 1-3字符
        
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.substr(i, chunkSize));
        }
        
        return chunks;
    }

    async adjustStrategyOnError(domain, operation, error) {
        // 根据错误类型调整策略
        if (error.message.includes('timeout')) {
            // 增加延迟
            this.rateLimiter.increaseDelay(domain, 2000);
        } else if (error.message.includes('blocked')) {
            // 减少操作频率
            this.rateLimiter.decreaseRate(domain);
        }
    }
}

/**
 * 速率限制器
 */
class RateLimiter {
    constructor() {
        this.domainRates = new Map();
        this.globalRates = new Map();
    }

    checkRate(domain, operationType) {
        const now = Date.now();
        const key = `${domain}:${operationType}`;
        
        if (!this.domainRates.has(key)) {
            this.domainRates.set(key, []);
        }

        const operations = this.domainRates.get(key);
        const recentOps = operations.filter(op => now - op.timestamp < 60000); // 1分钟内
        
        // 不同操作类型的限制
        const limits = {
            'click': { max: 20, window: 60000 },
            'navigate': { max: 10, window: 60000 },
            'scroll': { max: 30, window: 60000 },
            'extract': { max: 5, window: 60000 }
        };

        const limit = limits[operationType] || { max: 10, window: 60000 };
        
        if (recentOps.length >= limit.max) {
            return {
                allowed: false,
                reason: `${operationType} 操作超过限制 (${limit.max}/分钟)`
            };
        }

        // 记录操作
        operations.push({ timestamp: now });
        
        return { allowed: true };
    }

    increaseDelay(domain, delay) {
        if (!this.domainRates.has(`${domain}:delay`)) {
            this.domainRates.set(`${domain}:delay`, 0);
        }
        
        const currentDelay = this.domainRates.get(`${domain}:delay`);
        this.domainRates.set(`${domain}:delay`, currentDelay + delay);
    }

    decreaseRate(domain) {
        // 减少操作频率的具体实现
        const keys = Array.from(this.domainRates.keys()).filter(key => key.startsWith(domain));
        keys.forEach(key => {
            const operations = this.domainRates.get(key);
            // 减少操作记录
            this.domainRates.set(key, operations.slice(Math.floor(operations.length / 2)));
        });
    }
}

/**
 * 行为模拟器
 */
class BehaviorSimulator {
    constructor() {
        this.behaviorLog = [];
        this.delayHistory = [];
    }

    recordDelay(delay) {
        this.delayHistory.push({
            delay,
            timestamp: Date.now()
        });
        
        // 限制历史记录长度
        if (this.delayHistory.length > 100) {
            this.delayHistory = this.delayHistory.slice(-50);
        }
    }

    recordAbnormalBehavior(domain, operation, error) {
        this.behaviorLog.push({
            domain,
            operation: operation.type,
            error: error.message,
            timestamp: Date.now()
        });
    }

    getAverageDelay() {
        if (this.delayHistory.length === 0) return 0;
        
        const sum = this.delayHistory.reduce((acc, log) => acc + log.delay, 0);
        return sum / this.delayHistory.length;
    }

    getBehaviorReport() {
        const recentAbnormal = this.behaviorLog.filter(
            log => Date.now() - log.timestamp < 3600000 // 1小时内
        );
        
        return {
            totalAbnormalBehaviors: this.behaviorLog.length,
            recentAbnormalBehaviors: recentAbnormal.length,
            averageDelay: this.getAverageDelay(),
            recommendations: this.generateBehaviorRecommendations()
        };
    }

    generateBehaviorRecommendations() {
        const recommendations = [];
        
        if (this.delayHistory.length > 0) {
            const avgDelay = this.getAverageDelay();
            if (avgDelay < 200) {
                recommendations.push('建议增加操作延迟');
            } else if (avgDelay > 2000) {
                recommendations.push('延迟过长，可能影响效率');
            }
        }
        
        return recommendations;
    }
}

module.exports = { SecurityManager, RateLimiter, BehaviorSimulator };