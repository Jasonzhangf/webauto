/**
 * WebAuto Operator Framework - Cookie操作子
 * @package @webauto/operator-framework
 */
import { NonPageOperator } from '../../core/NonPageOperator';
import { OperatorCategory, OperatorType } from '../../core/types/OperatorTypes';
import { promises as fs } from 'fs';
import * as path from 'path';
export class CookieOperator extends NonPageOperator {
    constructor(config = {}) {
        super({
            id: 'cookie-operator',
            name: 'Cookie操作子',
            type: OperatorType.NON_PAGE,
            category: OperatorCategory.BROWSER,
            description: '管理浏览器Cookie的保存、加载和清除操作',
            requireInitialization: false,
            asyncSupported: true,
            maxConcurrency: 5,
            ...config
        });
        this._cookieStore = new Map();
    }
    async executeNonPageOperation(params) {
        switch (params.action) {
            case 'save':
                return this.saveCookies(params.path || './cookies.json');
            case 'load':
                return this.loadCookies(params.path || './cookies.json');
            case 'clear':
                return this.clearCookies(params.domain);
            case 'list':
                return this.listCookies(params.domain);
            default:
                return this.createErrorResult(`未知操作: ${params.action}`);
        }
    }
    validateParams(params) {
        if (!params.action || !['save', 'load', 'clear', 'list'].includes(params.action)) {
            return false;
        }
        if ((params.action === 'save' || params.action === 'load') && !params.path) {
            return false;
        }
        return true;
    }
    // Cookie管理方法
    async saveCookies(filePath) {
        try {
            const cookies = Array.from(this._cookieStore.values());
            const dirPath = path.dirname(filePath);
            // 确保目录存在
            await fs.mkdir(dirPath, { recursive: true });
            // 保存Cookie到文件
            await fs.writeFile(filePath, JSON.stringify(cookies, null, 2));
            this.log(`Cookie已保存到: ${filePath}`);
            return this.createSuccessResult({
                saved: true,
                path: filePath,
                count: cookies.length
            });
        }
        catch (error) {
            return this.createErrorResult(`保存Cookie失败: ${error.message}`);
        }
    }
    async loadCookies(filePath) {
        try {
            // 检查文件是否存在
            try {
                await fs.access(filePath);
            }
            catch {
                return this.createErrorResult(`Cookie文件不存在: ${filePath}`);
            }
            // 读取Cookie文件
            const data = await fs.readFile(filePath, 'utf-8');
            const cookies = JSON.parse(data);
            // 加载Cookie到内存
            this._cookieStore.clear();
            cookies.forEach(cookie => {
                const key = `${cookie.name}:${cookie.domain || 'default'}`;
                this._cookieStore.set(key, cookie);
            });
            this.log(`已加载 ${cookies.length} 个Cookie从: ${filePath}`);
            return this.createSuccessResult({
                loaded: true,
                path: filePath,
                count: cookies.length
            });
        }
        catch (error) {
            return this.createErrorResult(`加载Cookie失败: ${error.message}`);
        }
    }
    clearCookies(domain) {
        try {
            let clearedCount = 0;
            if (domain) {
                // 清除指定域名的Cookie
                for (const [key, cookie] of this._cookieStore) {
                    if (cookie.domain === domain) {
                        this._cookieStore.delete(key);
                        clearedCount++;
                    }
                }
            }
            else {
                // 清除所有Cookie
                clearedCount = this._cookieStore.size;
                this._cookieStore.clear();
            }
            this.log(`已清除 ${clearedCount} 个Cookie`);
            return this.createSuccessResult({
                cleared: true,
                domain: domain || 'all',
                count: clearedCount
            });
        }
        catch (error) {
            return this.createErrorResult(`清除Cookie失败: ${error.message}`);
        }
    }
    listCookies(domain) {
        try {
            let cookies;
            if (domain) {
                // 列出指定域名的Cookie
                cookies = Array.from(this._cookieStore.values()).filter(cookie => cookie.domain === domain);
            }
            else {
                // 列出所有Cookie
                cookies = Array.from(this._cookieStore.values());
            }
            return this.createSuccessResult({
                cookies,
                count: cookies.length,
                domain: domain || 'all'
            });
        }
        catch (error) {
            return this.createErrorResult(`列出Cookie失败: ${error.message}`);
        }
    }
    // 扩展方法
    async setCookie(cookie) {
        try {
            const key = `${cookie.name}:${cookie.domain || 'default'}`;
            this._cookieStore.set(key, cookie);
            return this.createSuccessResult({
                set: true,
                cookie
            });
        }
        catch (error) {
            return this.createErrorResult(`设置Cookie失败: ${error.message}`);
        }
    }
    async getCookie(name, domain) {
        try {
            const key = `${name}:${domain || 'default'}`;
            const cookie = this._cookieStore.get(key);
            if (!cookie) {
                return this.createErrorResult(`Cookie未找到: ${name}`);
            }
            return this.createSuccessResult({
                cookie
            });
        }
        catch (error) {
            return this.createErrorResult(`获取Cookie失败: ${error.message}`);
        }
    }
    async deleteCookie(name, domain) {
        try {
            const key = `${name}:${domain || 'default'}`;
            const deleted = this._cookieStore.delete(key);
            if (!deleted) {
                return this.createErrorResult(`Cookie未找到: ${name}`);
            }
            return this.createSuccessResult({
                deleted: true,
                name,
                domain: domain || 'default'
            });
        }
        catch (error) {
            return this.createErrorResult(`删除Cookie失败: ${error.message}`);
        }
    }
    // 批量操作
    async importCookies(cookies) {
        try {
            let importCount = 0;
            cookies.forEach(cookie => {
                const key = `${cookie.name}:${cookie.domain || 'default'}`;
                this._cookieStore.set(key, cookie);
                importCount++;
            });
            return this.createSuccessResult({
                imported: true,
                count: importCount
            });
        }
        catch (error) {
            return this.createErrorResult(`导入Cookie失败: ${error.message}`);
        }
    }
    async exportCookies(domain) {
        try {
            let cookies;
            if (domain) {
                cookies = Array.from(this._cookieStore.values()).filter(cookie => cookie.domain === domain);
            }
            else {
                cookies = Array.from(this._cookieStore.values());
            }
            return this.createSuccessResult({
                cookies,
                count: cookies.length
            });
        }
        catch (error) {
            return this.createErrorResult(`导出Cookie失败: ${error.message}`);
        }
    }
    // 统计信息
    async getStats() {
        try {
            const stats = {
                total: this._cookieStore.size,
                domains: new Set(Array.from(this._cookieStore.values()).map(c => c.domain)).size,
                names: new Set(Array.from(this._cookieStore.values()).map(c => c.name)).size,
                secure: Array.from(this._cookieStore.values()).filter(c => c.secure).length,
                httpOnly: Array.from(this._cookieStore.values()).filter(c => c.httpOnly).length
            };
            return this.createSuccessResult(stats);
        }
        catch (error) {
            return this.createErrorResult(`获取统计信息失败: ${error.message}`);
        }
    }
}
//# sourceMappingURL=CookieOperator.js.map