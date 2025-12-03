/**
 * 1688 Cookie管理器
 * 提供完整的cookie保存、加载和备份功能
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class CookieManager {
    constructor() {
        this.cookieDir = path.join(os.homedir(), '.webauto', 'cookies');
        this.mainCookieFile = path.join(this.cookieDir, '1688-domestic.json');
        this.ensureCookieDir();
    }

    /**
     * 确保cookie目录存在
     */
    ensureCookieDir() {
        if (!fs.existsSync(this.cookieDir)) {
            fs.mkdirSync(this.cookieDir, { recursive: true });
        }
    }

    /**
     * 保存完整cookie集合
     * @param {Array} cookies - Playwright获取的cookie数组
     * @param {Object} options - 选项
     * @returns {Object} 保存结果
     */
    saveCookies(cookies, options = {}) {
        const {
            createBackup = true,
            validateLogin = true
        } = options;

        try {
            // 验证登录状态
            if (validateLogin) {
                const loginStatus = this.validateLoginStatus(cookies);
                if (!loginStatus.isLoggedIn) {
                    return {
                        success: false,
                        error: '未检测到有效的登录状态',
                        loginStatus
                    };
                }
            }

            // 创建备份
            let backupFile = null;
            if (createBackup) {
                backupFile = this.createBackup(cookies);
            }

            // 保存到主文件
            const cookieData = JSON.stringify(cookies, null, 2);
            fs.writeFileSync(this.mainCookieFile, cookieData);

            // 统计信息
            const stats = this.getCookieStats(cookies);

            return {
                success: true,
                cookieCount: cookies.length,
                backupFile,
                stats,
                loginStatus: this.validateLoginStatus(cookies),
                savedAt: new Date().toISOString()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                cookieCount: 0
            };
        }
    }

    /**
     * 创建cookie备份
     * @param {Array} cookies - Cookie数组
     * @returns {string} 备份文件路径
     */
    createBackup(cookies) {
        const timestamp = Date.now();
        const backupFile = this.mainCookieFile.replace('.json', `.backup.${timestamp}.json`);
        const backupData = JSON.stringify(cookies, null, 2);
        fs.writeFileSync(backupFile, backupData);
        return backupFile;
    }

    /**
     * 加载cookies
     * @param {string} source - 来源文件或使用最新备份
     * @returns {Array|null} Cookie数组
     */
    loadCookies(source = null) {
        try {
            let cookieFile = this.mainCookieFile;

            if (source === 'latest-backup') {
                const latestBackup = this.getLatestBackup();
                if (latestBackup) {
                    cookieFile = latestBackup;
                }
            } else if (source) {
                cookieFile = source;
            }

            if (!fs.existsSync(cookieFile)) {
                return null;
            }

            const cookieData = fs.readFileSync(cookieFile, 'utf8');
            return JSON.parse(cookieData);

        } catch (error) {
            console.error('加载cookies失败:', error.message);
            return null;
        }
    }

    /**
     * 验证登录状态
     * @param {Array} cookies - Cookie数组
     * @returns {Object} 登录状态信息
     */
    validateLoginStatus(cookies) {
        const loginCookie = cookies.find(c => c.name === '__cn_logon__');
        const userIdCookie = cookies.find(c => c.name === '__cn_logon_id__');
        const memberCookie = cookies.find(c => c.name === 'last_mid');

        const isLoggedIn = loginCookie && loginCookie.value === 'true';
        const userId = userIdCookie ? userIdCookie.value : null;
        const memberId = memberCookie ? memberCookie.value : null;

        // 检查关键domains
        const domains1688 = cookies.filter(c => c.domain.includes('1688.com')).length;
        const domainsTaobao = cookies.filter(c => c.domain.includes('taobao.com')).length;

        return {
            isLoggedIn,
            userId,
            memberId,
            loginCookieValue: loginCookie ? loginCookie.value : null,
            domainStats: {
                total1688: domains1688,
                totalTaobao: domainsTaobao,
                total: cookies.length
            },
            isValid: isLoggedIn && domains1688 > 0
        };
    }

    /**
     * 获取cookie统计信息
     * @param {Array} cookies - Cookie数组
     * @returns {Object} 统计信息
     */
    getCookieStats(cookies) {
        const domains = {};
        const httpOnly = { count: 0, names: [] };
        const secure = { count: 0, names: [] };
        const session = { count: 0, names: [] };

        cookies.forEach(cookie => {
            // 域名统计
            const domain = cookie.domain || 'unknown';
            domains[domain] = (domains[domain] || 0) + 1;

            // 安全属性统计
            if (cookie.httpOnly) {
                httpOnly.count++;
                httpOnly.names.push(cookie.name);
            }
            if (cookie.secure) {
                secure.count++;
                secure.names.push(cookie.name);
            }
            if (cookie.expires === -1 || cookie.expires === null) {
                session.count++;
                session.names.push(cookie.name);
            }
        });

        // 排序域名
        const sortedDomains = Object.entries(domains)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .reduce((acc, [domain, count]) => {
                acc[domain] = count;
                return acc;
            }, {});

        return {
            total: cookies.length,
            domains: sortedDomains,
            security: {
                httpOnly,
                secure,
                session
            }
        };
    }

    /**
     * 获取最新备份文件
     * @returns {string|null} 最新备份文件路径
     */
    getLatestBackup() {
        try {
            const backupFiles = fs.readdirSync(this.cookieDir)
                .filter(file => file.startsWith('1688-domestic.backup.') && file.endsWith('.json'))
                .map(file => ({
                    file,
                    path: path.join(this.cookieDir, file),
                    timestamp: parseInt(file.split('.')[3])
                }))
                .sort((a, b) => b.timestamp - a.timestamp);

            return backupFiles.length > 0 ? backupFiles[0].path : null;

        } catch (error) {
            return null;
        }
    }

    /**
     * 列出所有备份文件
     * @returns {Array} 备份文件列表
     */
    listBackups() {
        try {
            const backupFiles = fs.readdirSync(this.cookieDir)
                .filter(file => file.startsWith('1688-domestic.backup.') && file.endsWith('.json'))
                .map(file => {
                    const filePath = path.join(this.cookieDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        file,
                        path: filePath,
                        size: stats.size,
                        createdAt: stats.birthtime.toISOString(),
                        timestamp: parseInt(file.split('.')[3])
                    };
                })
                .sort((a, b) => b.timestamp - a.timestamp);

            return backupFiles;

        } catch (error) {
            return [];
        }
    }

    /**
     * 清理旧备份（保留最近10个）
     * @returns {number} 删除的文件数量
     */
    cleanupOldBackups() {
        const backups = this.listBackups();
        if (backups.length <= 10) return 0;

        const toDelete = backups.slice(10);
        let deletedCount = 0;

        toDelete.forEach(backup => {
            try {
                fs.unlinkSync(backup.path);
                deletedCount++;
            } catch (error) {
                console.error('删除备份失败:', backup.file, error.message);
            }
        });

        return deletedCount;
    }

    /**
     * 检查主cookie文件状态
     * @returns {Object} 文件状态信息
     */
    checkMainCookieFile() {
        try {
            if (!fs.existsSync(this.mainCookieFile)) {
                return {
                    exists: false,
                    reason: '主cookie文件不存在'
                };
            }

            const stats = fs.statSync(this.mainCookieFile);
            const cookies = this.loadCookies();

            if (!cookies || !Array.isArray(cookies)) {
                return {
                    exists: true,
                    valid: false,
                    reason: 'cookie文件格式无效',
                    size: stats.size,
                    modifiedAt: stats.mtime.toISOString()
                };
            }

            const loginStatus = this.validateLoginStatus(cookies);
            const cookieStats = this.getCookieStats(cookies);

            return {
                exists: true,
                valid: true,
                size: stats.size,
                modifiedAt: stats.mtime.toISOString(),
                cookieCount: cookies.length,
                loginStatus,
                stats: cookieStats
            };

        } catch (error) {
            return {
                exists: false,
                valid: false,
                reason: error.message
            };
        }
    }
}

module.exports = CookieManager;
module.exports.default = CookieManager;