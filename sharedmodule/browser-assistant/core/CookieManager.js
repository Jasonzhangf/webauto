const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Cookie 管理系统 - 专注于社交网站登录状态管理
 */
class CookieManager {
    constructor() {
        this.cookieStorage = new Map();
        this.encryptionKey = process.env.COOKIE_ENCRYPTION_KEY || 'webauto-cookie-key-2024';
        this.cookieDir = path.join(process.env.HOME || '~', '.webauto', 'cookies');
        this.cookieValidation = new CookieValidation();
        this.cookieBackup = new CookieBackup();
        
        this.ensureCookieDir();
    }

    /**
     * 确保 cookie 目录存在
     */
    async ensureCookieDir() {
        try {
            await fs.mkdir(this.cookieDir, { recursive: true });
        } catch (error) {
            console.error('创建 cookie 目录失败:', error);
        }
    }

    /**
     * 检查是否有指定域名的 cookie
     */
    async hasCookies(domain) {
        const cookieFile = this.getCookieFilePath(domain);
        
        try {
            const exists = await fs.access(cookieFile).then(() => true).catch(() => false);
            if (!exists) {
                return false;
            }

            const data = await fs.readFile(cookieFile, 'utf8');
            const cookies = JSON.parse(this.decrypt(data));
            
            // 验证 cookie 是否有效
            const validCookies = this.cookieValidation.validateCookies(cookies, domain);
            return validCookies.length > 0;
            
        } catch (error) {
            console.warn(`Cookie 检查失败 ${domain}:`, error.message);
            return false;
        }
    }

    /**
     * 加载 cookie 到浏览器上下文
     */
    async loadCookies(context, domain) {
        try {
            const cookieFile = this.getCookieFilePath(domain);
            const data = await fs.readFile(cookieFile, 'utf8');
            const cookies = JSON.parse(this.decrypt(data));
            
            // 验证并过滤 cookie
            const validCookies = this.cookieValidation.validateCookies(cookies, domain);
            
            if (validCookies.length === 0) {
                throw new Error(`没有有效的 cookie for domain: ${domain}`);
            }

            // 加载到浏览器
            await context.addCookies(validCookies);
            
            console.log(`✅ 成功加载 ${validCookies.length} 个 cookie for ${domain}`);
            return validCookies;
            
        } catch (error) {
            console.error(`Cookie 加载失败 ${domain}:`, error.message);
            throw error;
        }
    }

    /**
     * 从浏览器保存 cookie
     */
    async saveCookies(page, domain) {
        try {
            const cookies = await page.context().cookies();
            const domainCookies = this.filterCookiesByDomain(cookies, domain);
            
            if (domainCookies.length === 0) {
                console.warn(`没有找到 ${domain} 的 cookie`);
                return;
            }

            // 加密并保存
            const encrypted = this.encrypt(JSON.stringify(domainCookies));
            const cookieFile = this.getCookieFilePath(domain);
            
            await fs.writeFile(cookieFile, encrypted);
            
            // 创建备份
            await this.cookieBackup.createBackup(domain, domainCookies);
            
            console.log(`✅ 成功保存 ${domainCookies.length} 个 cookie for ${domain}`);
            return domainCookies;
            
        } catch (error) {
            console.error(`Cookie 保存失败 ${domain}:`, error.message);
            throw error;
        }
    }

    /**
     * 更新 cookie (智能合并)
     */
    async updateCookies(page, domain) {
        try {
            const currentCookies = await page.context().cookies();
            const domainCookies = this.filterCookiesByDomain(currentCookies, domain);
            
            // 读取现有 cookie
            const existingCookies = await this.loadStoredCookies(domain);
            
            // 智能合并 cookie
            const mergedCookies = this.mergeCookies(existingCookies, domainCookies);
            
            // 保存合并后的 cookie
            const encrypted = this.encrypt(JSON.stringify(mergedCookies));
            const cookieFile = this.getCookieFilePath(domain);
            await fs.writeFile(cookieFile, encrypted);
            
            console.log(`✅ Cookie 更新成功: ${domain} (${mergedCookies.length} 个)`);
            return mergedCookies;
            
        } catch (error) {
            console.error(`Cookie 更新失败 ${domain}:`, error.message);
            throw error;
        }
    }

    /**
     * 清除指定域名的 cookie
     */
    async clearCookies(domain) {
        try {
            const cookieFile = this.getCookieFilePath(domain);
            await fs.unlink(cookieFile);
            
            console.log(`✅ Cookie 清除成功: ${domain}`);
            return true;
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`⚠️ Cookie 文件不存在: ${domain}`);
                return true;
            }
            throw error;
        }
    }

    /**
     * 验证 cookie 有效性
     */
    async validateCookies(domain) {
        try {
            const cookies = await this.loadStoredCookies(domain);
            const validCookies = this.cookieValidation.validateCookies(cookies, domain);
            
            console.log(`🔍 Cookie 验证结果: ${domain} (${validCookies.length}/${cookies.length} 有效)`);
            return {
                valid: validCookies.length > 0,
                total: cookies.length,
                validCount: validCookies.length,
                cookies: validCookies
            };
            
        } catch (error) {
            console.error(`Cookie 验证失败 ${domain}:`, error.message);
            return {
                valid: false,
                total: 0,
                validCount: 0,
                cookies: []
            };
        }
    }

    /**
     * 批量验证多个域名的 cookie
     */
    async batchValidateCookies(domains) {
        const results = new Map();
        
        for (const domain of domains) {
            const result = await this.validateCookies(domain);
            results.set(domain, result);
        }
        
        return results;
    }

    /**
     * 加载存储的 cookie
     */
    async loadStoredCookies(domain) {
        try {
            const cookieFile = this.getCookieFilePath(domain);
            const data = await fs.readFile(cookieFile, 'utf8');
            return JSON.parse(this.decrypt(data));
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * 获取 cookie 文件路径
     */
    getCookieFilePath(domain) {
        const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
        return path.join(this.cookieDir, `${safeDomain}.json`);
    }

    /**
     * 按 domain 过滤 cookie
     */
    filterCookiesByDomain(cookies, domain) {
        return cookies.filter(cookie => {
            return cookie.domain === domain || 
                   cookie.domain === `.${domain}` || 
                   cookie.domain.endsWith(`.${domain}`);
        });
    }

    /**
     * 智能合并 cookie
     */
    mergeCookies(existing, newCookies) {
        const merged = [...existing];
        const existingNames = new Set(existing.map(c => c.name));
        
        for (const newCookie of newCookies) {
            if (existingNames.has(newCookie.name)) {
                // 替换已存在的 cookie
                const index = merged.findIndex(c => c.name === newCookie.name);
                merged[index] = newCookie;
            } else {
                // 添加新 cookie
                merged.push(newCookie);
            }
        }
        
        return merged;
    }

    /**
     * 加密数据
     */
    encrypt(data) {
        const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    /**
     * 解密数据
     */
    decrypt(encryptedData) {
        try {
            // 首先尝试直接解析为JSON（兼容非加密格式）
            JSON.parse(encryptedData);
            return encryptedData;
        } catch (jsonError) {
            try {
                // 如果不是JSON格式，尝试解密
                const decipher = crypto.createDecipheriv('aes-256-cbc', 
                    crypto.createHash('sha256').update(this.encryptionKey).digest('base64').substr(0, 32),
                    Buffer.from(this.encryptionKey.substr(0, 16), 'utf8'));
                let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                return decrypted;
            } catch (decryptError) {
                // 如果解密失败，尝试旧的createDecipher方法（向后兼容）
                try {
                    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
                    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
                    decrypted += decipher.final('utf8');
                    return decrypted;
                } catch (oldDecryptError) {
                    // 如果都失败了，返回原始数据
                    console.warn('Cookie解密失败，使用原始数据:', oldDecryptError.message);
                    return encryptedData;
                }
            }
        }
    }
}

/**
 * Cookie 验证类
 */
class CookieValidation {
    /**
     * 验证 cookie 有效性
     */
    validateCookies(cookies, domain) {
        const now = Date.now();
        const validCookies = [];
        
        for (const cookie of cookies) {
            // 检查过期时间
            if (cookie.expires && cookie.expires * 1000 < now) {
                continue;
            }
            
            // 检查域名匹配
            if (!this.isValidDomain(cookie, domain)) {
                continue;
            }
            
            // 检查必要的 cookie 属性
            if (!cookie.name || !cookie.value) {
                continue;
            }
            
            // 社交网站特殊验证
            if (this.isSocialMediaCookie(cookie)) {
                if (!this.validateSocialMediaCookie(cookie)) {
                    continue;
                }
            }
            
            validCookies.push(cookie);
        }
        
        return validCookies;
    }

    /**
     * 检查域名有效性
     */
    isValidDomain(cookie, targetDomain) {
        return cookie.domain === targetDomain || 
               cookie.domain === `.${targetDomain}` || 
               targetDomain.endsWith(cookie.domain);
    }

    /**
     * 判断是否为社交媒体 cookie
     */
    isSocialMediaCookie(cookie) {
        const socialCookieNames = [
            'sessionid', 'session_id', 'user_session',
            'auth_token', 'access_token', 'login_token',
            'user_id', 'uid', 'userid',
            'remember_token', 'remember_me'
        ];
        
        return socialCookieNames.some(name => 
            cookie.name.toLowerCase().includes(name)
        );
    }

    /**
     * 验证社交媒体 cookie
     */
    validateSocialMediaCookie(cookie) {
        // 检查 cookie 值长度
        if (cookie.value.length < 10) {
            return false;
        }
        
        // 检查是否包含特殊字符
        const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(cookie.value);
        if (!hasSpecialChars) {
            return false;
        }
        
        return true;
    }
}

/**
 * Cookie 备份类
 */
class CookieBackup {
    constructor() {
        this.backupDir = path.join(process.env.HOME || '~', '.webauto', 'cookie-backups');
        this.ensureBackupDir();
    }

    async ensureBackupDir() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
        } catch (error) {
            console.error('创建备份目录失败:', error);
        }
    }

    async createBackup(domain, cookies) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(this.backupDir, `${domain}_${timestamp}.json`);
            
            await fs.writeFile(backupFile, JSON.stringify(cookies, null, 2));
            
            // 清理旧备份 (保留最近 5 个)
            await this.cleanupOldBackups(domain);
            
        } catch (error) {
            console.error('创建 cookie 备份失败:', error);
        }
    }

    async cleanupOldBackups(domain) {
        try {
            const files = await fs.readdir(this.backupDir);
            const domainFiles = files.filter(f => f.startsWith(domain));
            
            if (domainFiles.length > 5) {
                // 按时间排序，删除最旧的
                domainFiles.sort();
                const filesToDelete = domainFiles.slice(0, domainFiles.length - 5);
                
                for (const file of filesToDelete) {
                    await fs.unlink(path.join(this.backupDir, file));
                }
            }
        } catch (error) {
            console.error('清理旧备份失败:', error);
        }
    }

    async restoreBackup(domain, timestamp) {
        try {
            const backupFile = path.join(this.backupDir, `${domain}_${timestamp}.json`);
            const data = await fs.readFile(backupFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('恢复 cookie 备份失败:', error);
            throw error;
        }
    }

    async listBackups(domain) {
        try {
            const files = await fs.readdir(this.backupDir);
            const domainFiles = files.filter(f => f.startsWith(domain));
            return domainFiles.map(f => {
                const timestamp = f.replace(`${domain}_`, '').replace('.json', '');
                return {
                    timestamp,
                    file: f,
                    path: path.join(this.backupDir, f)
                };
            });
        } catch (error) {
            console.error('列出备份失败:', error);
            return [];
        }
    }
}

module.exports = { CookieManager, CookieValidation, CookieBackup };