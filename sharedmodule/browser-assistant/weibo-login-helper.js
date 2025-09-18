#!/usr/bin/env node

/**
 * 微博登录流程脚本
 * 启动浏览器让用户手动登录，然后保存cookie
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class WeiboLoginHelper {
    constructor() {
        this.cookieDir = path.join(process.env.HOME || '~', '.webauto', 'cookies');
        this.cookieFile = path.join(this.cookieDir, 'weibo.com.json');
    }

    /**
     * 简单的cookie加密
     */
    encryptCookieData(data) {
        const cipher = crypto.createCipher('aes-256-cbc', 'weibo-cookie-key');
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    /**
     * 简单的cookie解密
     */
    decryptCookieData(encryptedData) {
        try {
            const decipher = crypto.createDecipher('aes-256-cbc', 'weibo-cookie-key');
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        } catch (error) {
            return null;
        }
    }

    /**
     * 保存cookie到文件
     */
    async saveCookies(cookies) {
        try {
            // 确保目录存在
            await fs.mkdir(this.cookieDir, { recursive: true });
            
            // 加密cookie数据
            const encryptedData = this.encryptCookieData({
                domain: 'weibo.com',
                cookies: cookies,
                timestamp: new Date().toISOString(),
                version: '1.0'
            });
            
            // 保存到文件
            await fs.writeFile(this.cookieFile, encryptedData);
            
            console.log('✅ Cookie已成功保存到:', this.cookieFile);
            return true;
        } catch (error) {
            console.error('❌ 保存Cookie失败:', error.message);
            return false;
        }
    }

    /**
     * 检查是否已有cookie
     */
    async hasExistingCookies() {
        try {
            const data = await fs.readFile(this.cookieFile, 'utf8');
            const decrypted = this.decryptCookieData(data);
            
            if (decrypted && decrypted.cookies && decrypted.cookies.length > 0) {
                console.log('📁 找到现有Cookie文件');
                console.log(`📊 Cookie数量: ${decrypted.cookies.length}`);
                console.log(`📅 保存时间: ${decrypted.timestamp}`);
                
                // 检查cookie是否仍然有效（简单的过期检查）
                const validCookies = decrypted.cookies.filter(cookie => {
                    if (cookie.expires) {
                        const expiryDate = new Date(cookie.expires);
                        return expiryDate > new Date();
                    }
                    return true; // 会话cookie默认有效
                });
                
                console.log(`✅ 有效Cookie: ${validCookies.length}/${decrypted.cookies.length}`);
                
                if (validCookies.length > 0) {
                    console.log('💡 现有Cookie仍然有效，可以跳过登录步骤');
                    return true;
                } else {
                    console.log('⚠️ 现有Cookie已过期，需要重新登录');
                    return false;
                }
            }
            
            return false;
        } catch (error) {
            console.log('📁 未找到现有Cookie文件');
            return false;
        }
    }

    /**
     * 启动登录流程
     */
    async startLoginFlow() {
        console.log('🚀 启动微博登录流程...\n');

        // 首先检查是否已有有效cookie
        const hasCookies = await this.hasExistingCookies();
        if (hasCookies) {
            console.log('💡 检测到有效Cookie，可以跳过登录');
            return true;
        }

        console.log('📋 登录步骤说明:');
        console.log('1. 浏览器将自动打开微博登录页面');
        console.log('2. 请手动完成登录（账号密码/扫码/短信等）');
        console.log('3. 登录成功后，脚本会自动保存Cookie');
        console.log('4. 保存完成后浏览器会自动关闭\n');

        const browser = await chromium.launch({
            headless: false, // 显示浏览器窗口
            viewport: { width: 1920, height: 1080 }
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            extraHTTPHeaders: {
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        });

        const page = await context.newPage();

        try {
            // 导航到微博首页
            console.log('🌐 打开微博首页...');
            await page.goto('https://weibo.com', { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });

            console.log('📍 请在浏览器中完成登录...');
            console.log('💡 支持的登录方式：');
            console.log('   • 账号密码登录');
            console.log('   • 手机号登录');
            console.log('   • 扫码登录');
            console.log('   • 短信登录\n');

            // 等待用户登录成功
            console.log('⏳ 等待登录完成...');
            
            let loginSuccess = false;
            let attempts = 0;
            const maxAttempts = 120; // 最多等待10分钟

            while (!loginSuccess && attempts < maxAttempts) {
                attempts++;
                
                // 检查当前URL是否不再是登录页面
                const currentUrl = page.url();
                
                // 检查是否包含登录相关关键词
                const isLoginPage = currentUrl.includes('login') || 
                                  currentUrl.includes('signin') ||
                                  currentUrl.includes('auth');
                
                // 检查页面标题
                const pageTitle = await page.title().catch(() => '');
                const hasLoginContent = await page.$('.login, .signin, [href*="login"]').then(el => !!el).catch(() => false);
                
                // 检查是否有用户登录标识
                const hasUserMenu = await page.$('.user-menu, .user-info, [data-user-id], .gn_header_userinfo').then(el => !!el).catch(() => false);
                
                if (!isLoginPage && !hasLoginContent && hasUserMenu) {
                    loginSuccess = true;
                    console.log('✅ 检测到登录成功！');
                    break;
                }
                
                // 每隔10秒显示一次状态
                if (attempts % 12 === 0) {
                    console.log(`⏳ 仍在等待登录... (${Math.floor(attempts / 12)}分钟)`);
                    console.log(`📍 当前页面: ${pageTitle}`);
                    console.log(`🔗 URL: ${currentUrl.substring(0, 100)}...`);
                }
                
                // 等待5秒后再次检查
                await page.waitForTimeout(5000);
            }

            if (!loginSuccess) {
                throw new Error('登录超时，请在10分钟内完成登录');
            }

            // 登录成功，等待页面完全加载
            console.log('🔄 等待页面完全加载...');
            await page.waitForTimeout(3000);

            // 获取并保存cookie
            console.log('🍪 获取登录Cookie...');
            const cookies = await context.cookies(['weibo.com', '.weibo.com']);
            
            if (cookies.length === 0) {
                throw new Error('未获取到Cookie，登录可能失败');
            }

            console.log(`📊 找到 ${cookies.length} 个Cookie`);
            
            // 显示重要的cookie信息
            const importantCookies = cookies.filter(cookie => 
                cookie.name.includes('SUB') || 
                cookie.name.includes('SUHB') ||
                cookie.name.includes('SINAGLOBAL') ||
                cookie.name.includes('WB') ||
                cookie.name.includes('XSRF-TOKEN')
            );
            
            if (importantCookies.length > 0) {
                console.log('🔑 重要认证Cookie:');
                importantCookies.forEach(cookie => {
                    console.log(`   • ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
                });
            }

            // 保存cookie
            const saveSuccess = await this.saveCookies(cookies);
            
            if (saveSuccess) {
                console.log('\n🎉 微博登录流程完成！');
                console.log('✅ Cookie已保存，可以开始使用自动化功能');
                return true;
            } else {
                throw new Error('Cookie保存失败');
            }

        } catch (error) {
            console.error('\n❌ 登录流程失败:', error.message);
            return false;
            
        } finally {
            // 清理浏览器资源
            try {
                await browser.close();
                console.log('🧹 浏览器已关闭');
            } catch (cleanupError) {
                console.warn('⚠️ 关闭浏览器时出错:', cleanupError.message);
            }
        }
    }

    /**
     * 验证保存的cookie
     */
    async verifyCookies() {
        try {
            console.log('🔍 验证保存的Cookie...');
            
            const data = await fs.readFile(this.cookieFile, 'utf8');
            const decrypted = this.decryptCookieData(data);
            
            if (!decrypted || !decrypted.cookies) {
                console.log('❌ Cookie文件损坏或无法解密');
                return false;
            }
            
            const cookies = decrypted.cookies;
            console.log(`📊 Cookie总数: ${cookies.length}`);
            
            // 检查关键认证cookie
            const authCookies = cookies.filter(cookie => 
                cookie.name.includes('SUB') || 
                cookie.name.includes('SUHB') ||
                cookie.name.includes('SINAGLOBAL') ||
                cookie.name.includes('WB')
            );
            
            console.log(`🔑 认证Cookie数量: ${authCookies.length}`);
            
            if (authCookies.length === 0) {
                console.log('⚠️ 未找到认证Cookie，可能登录不完整');
                return false;
            }
            
            // 检查cookie有效期
            const now = new Date();
            const validCookies = cookies.filter(cookie => {
                if (cookie.expires) {
                    const expiryDate = new Date(cookie.expires);
                    return expiryDate > now;
                }
                return true;
            });
            
            console.log(`✅ 有效Cookie: ${validCookies.length}/${cookies.length}`);
            
            if (validCookies.length < cookies.length * 0.8) {
                console.log('⚠️ 大部分Cookie已过期，建议重新登录');
                return false;
            }
            
            console.log('✅ Cookie验证通过！');
            return true;
            
        } catch (error) {
            console.error('❌ Cookie验证失败:', error.message);
            return false;
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const loginHelper = new WeiboLoginHelper();
    
    loginHelper.startLoginFlow()
        .then(success => {
            if (success) {
                console.log('\n🎯 下一步建议:');
                console.log('1. 运行 cookie 验证: node tools/WebAutoCLI.js cookie validate weibo.com');
                console.log('2. 测试架构功能: node tools/WebAutoCLI.js test architecture');
                console.log('3. 提取微博链接: node test-weibo-hot-link.js');
                process.exit(0);
            } else {
                console.log('\n❌ 登录流程失败，请重试');
                console.log('💡 如果遇到问题，可以尝试：');
                console.log('   • 检查网络连接');
                console.log('   • 使用不同的登录方式');
                console.log('   • 确保账号可以正常登录微博');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('❌ 脚本执行失败:', error.message);
            process.exit(1);
        });
}

module.exports = { WeiboLoginHelper };