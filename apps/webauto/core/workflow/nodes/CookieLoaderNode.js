// Cookie加载节点
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import BaseNode from './BaseNode.js';

class CookieLoaderNode extends BaseNode {
    constructor() {
        super();
        this.name = 'CookieLoaderNode';
        this.description = '加载Cookie到浏览器上下文';
    }

    async execute(context) {
        const { config, logger, context: browserContext } = context;

        try {
            logger.info('🍪 加载Cookie...');

            // 解析Cookie文件路径
            let cookiePath = config.cookiePath;
            // 波浪线展开
            if (cookiePath.startsWith('~/')) {
                cookiePath = join(os.homedir(), cookiePath.slice(2));
            }
            // 相对路径处理
            if (!cookiePath.startsWith('/')) {
                const basePath = process.cwd();
                cookiePath = join(basePath, cookiePath);
            }

            if (!existsSync(cookiePath)) {
                throw new Error(`Cookie文件不存在: ${cookiePath}`);
            }

            // 读取Cookie文件
            const raw = JSON.parse(readFileSync(cookiePath, 'utf8'));
            const cookieData = Array.isArray(raw) ? raw : (Array.isArray(raw.cookies) ? raw.cookies : []);
            if (!Array.isArray(cookieData)) {
                throw new Error('Cookie文件格式不正确，应为数组或包含 cookies 数组');
            }

            // 转换Cookie格式
            const cookies = cookieData.map(cookie => ({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                expires: cookie.expires,
                httpOnly: cookie.httpOnly,
                secure: cookie.secure,
                sameSite: cookie.sameSite
            }));

            // 添加Cookie到浏览器上下文
            await browserContext.addCookies(cookies);

            logger.info(`✅ Cookie加载成功，共 ${cookies.length} 个Cookie`);
            context.engine?.recordBehavior?.('cookie_load', { path: cookiePath, count: cookies.length });

            return {
                success: true,
                variables: {
                    cookiesLoaded: true,
                    cookieCount: cookies.length,
                    cookiePath: cookiePath
                }
            };

        } catch (error) {
            logger.error(`❌ Cookie加载失败: ${error.message}`);
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
                cookiePath: {
                    type: 'string',
                    description: 'Cookie文件路径'
                }
            },
            required: ['cookiePath']
        };
    }

    getInputs() {
        return [
            {
                name: 'context',
                type: 'object',
                description: '浏览器上下文'
            }
        ];
    }

    getOutputs() {
        return [
            {
                name: 'cookiesLoaded',
                type: 'boolean',
                description: 'Cookie加载状态'
            },
            {
                name: 'cookieCount',
                type: 'number',
                description: 'Cookie数量'
            }
        ];
    }
}

export default CookieLoaderNode;
