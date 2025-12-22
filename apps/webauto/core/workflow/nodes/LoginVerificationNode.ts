// 登录验证节点
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import os from 'node:os';
import BaseNode from './BaseNode';

class LoginVerificationNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

    constructor(nodeId: string, config: any) {
        super();
        this.name = 'LoginVerificationNode';
        this.description = '验证登录状态';
    }

    async execute(context: any, params: any): Promise<any> {
        const { config, logger, page, context: browserContext } = context;

        try {
            logger.info('🔐 验证登录状态...');

            const maxRetries = Number(config.maxRetries || 3);
            const retryDelay = Number(config.retryDelay || 2000);
            const selectors = (Array.isArray(config.loginSelectors) && config.loginSelectors.length)
              ? config.loginSelectors
              : [config.loginSelector].filter(Boolean);
            const successText = Array.isArray(config.successText) ? config.successText : [];
            const cookieNames = Array.isArray(config.cookieNames) ? config.cookieNames : [];
            const requireVisible = config.requireVisible !== false; // 默认需要可见
            const postWait = Number(config.postLoginWaitMs || 0);
            const autoSaveCookies = config.autoSaveCookies !== false; // 默认自动保存Cookie
            const cookieSavePath = config.cookieSavePath; // 可选的Cookie保存路径

            let isLoggedIn = false;
            let loginInfo = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // 1) 选择器检测（任意命中即可）
                    for (const sel of selectors) {
                        try {
                            const elements = await page.$$(sel);
                            if (elements && elements.length > 0) {
                                const visibleAny = requireVisible
                                  ? await Promise.any(elements.map(async el => await el.isVisible()).map(p => p.catch(()=>false))).catch(()=>false)
                                  : true;
                                loginInfo = { found: true, selector: sel, count: elements.length, visible: Boolean(visibleAny) };
                                if (!requireVisible || visibleAny) {
                                    isLoggedIn = true;
                                    break;
                                }
                            }
                        } catch {}
                    }

                    // 2) 文本信号（可选）
                    if (!isLoggedIn && successText.length) {
                        const text = await page.evaluate(() => document.body?.innerText || '');
                        if (successText.some(t => text.includes(t))) {
                            loginInfo = { ...(loginInfo||{}), textHit: true };
                            isLoggedIn = true;
                        }
                    }

                    // 3) Cookie 信号（可选）
                    if (!isLoggedIn && cookieNames.length && browserContext) {
                        const cookies = await browserContext.cookies();
                        const nameSet = new Set(cookies.map(c => c.name));
                        if (cookieNames.some(n => nameSet.has(n))) {
                            loginInfo = { ...(loginInfo||{}), cookieHit: true };
                            isLoggedIn = true;
                        }
                    }

                    if (isLoggedIn) {
                        context.engine?.recordBehavior?.('login_check', { attempt, success: true, info: loginInfo });
                        if (postWait > 0) { await this.sleep(postWait); }
                        logger.info(`✅ 登录验证成功 (尝试 ${attempt}/${maxRetries})`);

                        // 自动保存Cookie以防止风控
                        if (autoSaveCookies && browserContext) {
                            try {
                                let savePath = cookieSavePath;
                                if (!savePath) {
                                    // 如果没有指定路径，使用默认路径
                                    const hostFilter = config.hostFilter || 'default';
                                    savePath = `~/.webauto/cookies/${hostFilter}-domestic.json`;
                                }

                                // 展开 ~ 前缀
                                if (savePath.startsWith('~/')) {
                                    savePath = join(os.homedir(), savePath.slice(2));
                                }

                                const cookies = await browserContext.cookies();
                                mkdirSync(dirname(savePath), { recursive: true });
                                writeFileSync(savePath, JSON.stringify(cookies, null, 2));
                                logger.info(`🍪 登录成功后自动更新Cookie: ${cookies.length} 条 -> ${savePath}`);

                                // 更新返回变量
                                loginInfo.cookieUpdated = true;
                                loginInfo.cookieUpdatePath = savePath;
                                loginInfo.cookieUpdateCount = cookies.length;

                            } catch (cookieError) {
                                logger.warn(`⚠️ 自动保存Cookie失败: ${cookieError.message}`);
                            }
                        }

                        break;
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
                context.engine?.recordBehavior?.('login_check', { success: false });
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
