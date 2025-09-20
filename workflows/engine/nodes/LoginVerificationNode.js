// 登录验证节点
import BaseNode from './BaseNode.js';

class LoginVerificationNode extends BaseNode {
    constructor() {
        super();
        this.name = 'LoginVerificationNode';
        this.description = '验证登录状态';
    }

    async execute(context) {
        const { config, logger, page } = context;

        try {
            logger.info('🔐 验证登录状态...');

            const maxRetries = config.maxRetries || 3;
            const retryDelay = config.retryDelay || 2000;
            const loginSelector = config.loginSelector;

            let isLoggedIn = false;
            let loginInfo = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // 查找登录验证元素
                    const loginElement = await page.$(loginSelector);

                    if (loginElement) {
                        // 获取元素信息
                        const src = await loginElement.getAttribute('src');
                        const alt = await loginElement.getAttribute('alt');
                        const visible = await loginElement.isVisible();

                        loginInfo = {
                            found: true,
                            src: src,
                            alt: alt,
                            visible: visible,
                            selector: loginSelector
                        };

                        if (visible) {
                            isLoggedIn = true;
                            logger.info(`✅ 登录验证成功 (尝试 ${attempt}/${maxRetries})`);
                            break;
                        }
                    }

                    if (attempt < maxRetries) {
                        logger.warn(`⚠️ 登录元素未找到或不可见，等待重试... (${attempt}/${maxRetries})`);
                        await this.sleep(retryDelay);
                    }

                } catch (error) {
                    logger.warn(`⚠️ 登录验证检查失败: ${error.message} (${attempt}/${maxRetries})`);
                    if (attempt < maxRetries) {
                        await this.sleep(retryDelay);
                    }
                }
            }

            if (!isLoggedIn) {
                throw new Error('登录验证失败，请检查Cookie或登录状态');
            }

            return {
                success: true,
                variables: {
                    isLoggedIn: true,
                    loginInfo: loginInfo,
                    loginVerifiedAt: new Date().toISOString()
                }
            };

        } catch (error) {
            logger.error(`❌ 登录验证失败: ${error.message}`);
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
                loginSelector: {
                    type: 'string',
                    description: '登录验证元素选择器'
                },
                maxRetries: {
                    type: 'number',
                    description: '最大重试次数',
                    default: 3
                },
                retryDelay: {
                    type: 'number',
                    description: '重试延迟（毫秒）',
                    default: 2000
                }
            },
            required: ['loginSelector']
        };
    }

    getInputs() {
        return [
            {
                name: 'page',
                type: 'object',
                description: '页面实例'
            }
        ];
    }

    getOutputs() {
        return [
            {
                name: 'isLoggedIn',
                type: 'boolean',
                description: '登录状态'
            },
            {
                name: 'loginInfo',
                type: 'object',
                description: '登录信息'
            }
        ];
    }
}

export default LoginVerificationNode;