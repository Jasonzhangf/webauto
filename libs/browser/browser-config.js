/**
 * 浏览器配置管理类
 * 对标Python版本的BrowserConfig类
 */

export class BrowserConfig {
    // 核心中文配置（经过测试验证）
    static CHINESE_CONFIG = {
        locale: 'zh-CN',
        args: ['--lang=zh-CN']
    };
    
    // 基础反检测配置
    static ANTI_DETECTION_CONFIG = {
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    };
    
    // 性能优化配置
    static PERFORMANCE_CONFIG = {
        args: [
            '--disable-extensions',
            '--disable-gpu',
            '--disable-dev-tools-animations',
        ]
    };
    
    // 隐私保护配置
    static PRIVACY_CONFIG = {
        args: [
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
        ]
    };

    static getDefaultConfig() {
        const config = {
            headless: false,
            locale: 'zh-CN',
            args: ['--lang=zh-CN']
        };
        return config;
    }

    static getStealthConfig() {
        const config = this.getDefaultConfig();
        
        // 合并所有配置
        const allArgs = [];
        [this.ANTI_DETECTION_CONFIG, this.PERFORMANCE_CONFIG, this.PRIVACY_CONFIG].forEach(conf => {
            allArgs.push(...(conf.args || []));
        });
        
        // 去重并添加核心配置
        config.args = [...new Set([...allArgs, '--lang=zh-CN'])];
        
        return config;
    }

    static getHeadlessConfig() {
        const config = this.getDefaultConfig();
        config.headless = true;
        return config;
    }

    static mergeConfigs(...configs) {
        const result = {};
        
        configs.forEach(config => {
            Object.assign(result, config);
        });
        
        // 特殊处理 args 参数
        const allArgs = [];
        configs.forEach(config => {
            if (config.args && Array.isArray(config.args)) {
                allArgs.push(...config.args);
            }
        });
        
        if (allArgs.length > 0) {
            result.args = [...new Set(allArgs)]; // 去重
        }
        
        return result;
    }
}
