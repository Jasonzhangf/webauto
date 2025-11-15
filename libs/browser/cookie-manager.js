/**
 * Cookie管理器
 * 提供 Cookie 的保存、加载和管理功能
 *
 * 设计约束：
 * - 所有 Cookie 文件路径与布局逻辑只允许出现在本模块
 * - 上层模块（workflow / 容器 / 服务）只能通过高层 API 调用，不直接操作文件
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';

export class CookieManager {
    /**
     * @param {string|null} profileDir Profile目录，默认 ~/.webauto/cookies
     */
    constructor(profileDir = null) {
        this.profileDir = profileDir || join(homedir(), '.webauto', 'cookies');
        this.storageRoot = this.profileDir;
    }

    // --------- 基础域级别 API（向后兼容） ---------

    async saveCookies(cookies, domain = null) {
        if (!Array.isArray(cookies) || cookies.length === 0) {
            return { success: false, message: 'No cookies to save' };
        }

        try {
            const cookieData = {
                timestamp: Date.now(),
                domain: domain || 'default',
                cookies: cookies.map(cookie => ({
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path || '/',
                    expires: cookie.expires,
                    httpOnly: cookie.httpOnly || false,
                    secure: cookie.secure || false,
                    sameSite: cookie.sameSite || 'Lax'
                }))
            };

            const filename = domain ? `${domain}.json` : 'default.json';
            const filepath = join(this.storageRoot, filename);
            
            await mkdir(dirname(filepath), { recursive: true });
            await writeFile(filepath, JSON.stringify(cookieData, null, 2));
            
            return { success: true, path: filepath, count: cookies.length };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async loadCookies(domain = null) {
        try {
            const filename = domain ? `${domain}.json` : 'default.json';
            const filepath = join(this.storageRoot, filename);
            
            const data = await readFile(filepath, 'utf8');
            const cookieData = JSON.parse(data);
            
            return {
                success: true,
                cookies: cookieData.cookies,
                domain: cookieData.domain,
                timestamp: cookieData.timestamp
            };
        } catch (error) {
            return { success: false, message: error.message, cookies: [] };
        }
    }

    async loadBrowserState(context, domain = null) {
        try {
            const filename = domain ? `${domain}.json` : 'default.json';
            const filepath = join(this.storageRoot, filename);
            
            const data = await readFile(filepath, 'utf8');
            const cookieData = JSON.parse(data);
            
            if (cookieData.cookies && Array.isArray(cookieData.cookies)) {
                await context.addCookies(cookieData.cookies);
                return { success: true, count: cookieData.cookies.length };
            }
            
            return { success: false, message: 'No valid cookies found' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async saveBrowserState(context, domain = null) {
        try {
            const cookies = await context.cookies();
            const result = await this.saveCookies(cookies, domain);
            
            if (result.success) {
                return { success: true, path: result.path, count: result.count };
            }
            
            return result;
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async listDomains() {
        try {
            const fs = await import('fs');
            if (!fs.existsSync(this.storageRoot)) {
                return [];
            }
            
            const files = fs.readdirSync(this.storageRoot)
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));
            
            return files;
        } catch (error) {
            return [];
        }
    }

    async clearDomain(domain = null) {
        try {
            const fs = await import('fs');
            const filename = domain ? `${domain}.json` : 'default.json';
            const filepath = join(this.storageRoot, filename);
            
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                return { success: true, domain };
            }
            
            return { success: false, message: 'Domain not found' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // --------- URL / profile 级别高层 API ---------

    /**
     * 规范化 profileId 为安全的目录名
     * @param {string} profileId
     * @returns {string}
     * @private
     */
    _sanitizeProfile(profileId) {
        try {
            const s = String(profileId || 'default');
            return s.replace(/[^a-zA-Z0-9._-]/g, '_');
        } catch {
            return 'default';
        }
    }

    /**
     * 根据 URL 计算 host key（用于文件名）
     * @param {string} url
     * @returns {{hostKey: string|null, hostname: string|null}}
     * @private
     */
    _hostKeyFromUrl(url) {
        try {
            const u = new URL(url);
            const hostname = String(u.hostname || '').toLowerCase();
            if (!hostname) return { hostKey: null, hostname: null };
            const hostKey = hostname.replace(/[^a-z0-9.\-]/g, '_');
            return { hostKey, hostname };
        } catch {
            return { hostKey: null, hostname: null };
        }
    }

    /**
     * 获取 profile 目录
     * @param {string} profileId
     * @returns {string}
     * @private
     */
    _profileDir(profileId) {
        return this.profileDir;
    }

    /**
     * 根据 URL 生成候选 Cookie 文件列表（按优先级排序）
     * - profile 目录下的 host.json / eTLD+1.json
     * - 对 1688 场景，保留 legacy 的 ~/.webauto/cookies/1688-domestic.json
     * @param {string} url
     * @param {string} profileId
     * @returns {{baseDir: string, files: string[], hostname: string|null}}
     * @private
     */
    _candidateFilesForUrl(url, profileId) {
        const { hostKey, hostname } = this._hostKeyFromUrl(url);
        const baseDir = this._profileDir(profileId || 'default');
        const files = [];
        if (!hostKey || !hostname) return { baseDir, files, hostname };

        files.push(join(baseDir, `${hostKey}.json`));

        const parts = hostKey.split('.').filter(Boolean);
        if (parts.length >= 2) {
            const base = parts.slice(-2).join('.');
            if (base !== hostKey) {
                files.push(join(baseDir, `${base}.json`));
            }
        }

        if (hostname.includes('1688.com')) {
            // legacy 全局 1688 cookie 文件，保留兼容性
            const legacyRoot = join(homedir(), '.webauto', 'cookies');
            files.push(join(legacyRoot, '1688-domestic.json'));
        }

        return { baseDir, files, hostname };
    }

    /**
     * 按 URL 注入 Cookie（高层 API）
     * @param context Playwright BrowserContext
     * @param {string} url
     * @param {string} profileId
     * @returns {Promise<{success: boolean, count: number, message?: string}>}
     */
    async injectCookiesForUrl(context, url, profileId = 'default') {
        try {
            const fs = await import('fs');
            const { files } = this._candidateFilesForUrl(url, profileId);
            if (!files.length) {
                return { success: false, count: 0, message: 'No candidate cookie files' };
            }

            let loaded = 0;
            for (const path of files) {
                try {
                    if (!fs.existsSync(path)) continue;
                    const raw = JSON.parse(await readFile(path, 'utf8'));
                    const arr = Array.isArray(raw)
                        ? raw
                        : (Array.isArray(raw?.cookies) ? raw.cookies : null);
                    if (!Array.isArray(arr) || !arr.length) continue;
                    const shaped = arr.map((c) => {
                        const x = { ...c };
                        if (!x.path) x.path = '/';
                        if (x.expires !== undefined && Number(x.expires) <= 0) delete x.expires;
                        return x;
                    });
                    await context.addCookies(shaped);
                    loaded += shaped.length;
                } catch {
                    // ignore single file error and continue
                }
            }

            return {
                success: loaded > 0,
                count: loaded,
                message: loaded > 0 ? undefined : 'No cookies loaded for url',
            };
        } catch (error) {
            return { success: false, count: 0, message: error.message };
        }
    }

    /**
     * 按 URL 保存 Cookie（高层 API）
     * @param context Playwright BrowserContext
     * @param {string} url
     * @param {string} profileId
     * @returns {Promise<{success: boolean, path?: string, count?: number, message?: string}>}
     */
    async saveCookiesForUrl(context, url, profileId = 'default') {
        try {
            const { baseDir, hostname } = this._candidateFilesForUrl(url, profileId);
            if (!hostname) {
                return { success: false, message: 'Invalid url (no hostname)' };
            }
            const hostKey = hostname.replace(/[^a-z0-9.\-]/g, '_');
            const filepath = join(baseDir, `${hostKey}.json`);
            const cookies = await context.cookies();

            await mkdir(dirname(filepath), { recursive: true });
            const payload = {
                timestamp: Date.now(),
                url,
                host: hostname,
                cookies,
            };
            await writeFile(filepath, JSON.stringify(payload, null, 2));

            return { success: true, path: filepath, count: cookies.length };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * 清理某个 profile 的所有持久化 Cookie
     * @param {string} profileId
     * @returns {Promise<{success: boolean, profileId: string}>}
     */
    async clearProfile(profileId = 'default') {
        try {
            const fs = await import('fs');
            const dir = this._profileDir(profileId);
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
            return { success: true, profileId };
        } catch (error) {
            return { success: false, profileId, message: error.message };
        }
    }
}
