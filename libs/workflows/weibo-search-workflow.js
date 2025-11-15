// 微博搜索页链接捕获工作流
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class WeiboSearchWorkflow {
    constructor() {
        this.allLinks = new Set();
        this.config = {
            target: 50,
            baseUrl: 'https://s.weibo.com/weibo?q=',
            postContainer: '[class*="card"]',
            loginSelector: '[class*="avatar"] img[src*="tvax1.sinaimg.cn"]',
            maxPages: 10
        };
    }

    async execute(searchTerm) {
        console.log(`🎯 ===== 执行微博搜索页链接捕获工作流 =====`);
        console.log(`🔍 搜索关键词: ${searchTerm}`);

        const browser = await chromium.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });

        const page = await context.newPage();

        try {
            // 通用节点：加载Cookie
            await this.loadCookies(context);

            // 特定节点：构建搜索URL并导航
            const searchUrl = `${this.config.baseUrl}${encodeURIComponent(searchTerm)}`;
            console.log(`🌐 目标URL: ${searchUrl}`);

            await page.goto(searchUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // 通用节点：验证登录
            await this.verifyLogin(page);

            // 特定节点：搜索页分页捕获
            const result = await this.performPaginationCapture(page, searchTerm);

            // 通用节点：保存结果
            await this.saveResults(result, 'search', { searchTerm });

            return result;

        } finally {
            await browser.close();
        }
    }

    // 通用节点：加载Cookie
    async loadCookies(context) {
        try {
            const fs = await import('fs');
            const cookiePath = join(__dirname, '..', 'libs', 'operations-framework', 'cookies.json');
            const cookieData = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));

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

            await context.addCookies(cookies);
            console.log('✅ Cookie加载成功');
        } catch (error) {
            console.error('❌ Cookie加载失败:', error.message);
        }
    }

    // 通用节点：验证登录
    async verifyLogin(page) {
        try {
            const loginElement = await page.$(this.config.loginSelector);
            if (loginElement) {
                const src = await loginElement.getAttribute('src');
                console.log('🔐 登录状态:', { found: true, src, valid: true });
                return true;
            }
            throw new Error('登录验证失败');
        } catch (error) {
            console.log('🔐 登录状态:', { found: false, src: null, valid: false });
            throw new Error('登录验证失败，请检查Cookie');
        }
    }

    // 特定节点：搜索页分页捕获
    async performPaginationCapture(page, searchTerm) {
        console.log('🔄 开始分页捕获...');

        let pageCount = 0;
        let totalLinks = 0;
        const consecutiveFailures = { count: 0, max: 3 };

        // 初始捕获
        await this.captureCurrentLinks(page, '初始状态');

        while (pageCount < this.config.maxPages && this.allLinks.size < this.config.target) {
            pageCount++;
            console.log(`📄 处理第 ${pageCount} 页搜索结果...`);

            // 捕获当前页面链接
            const currentPageLinks = await this.captureCurrentPageLinks(page, pageCount);
            totalLinks = this.allLinks.size;

            console.log(`   📊 第${pageCount}页捕获: ${totalLinks} 个链接 (新增: ${currentPageLinks})`);

            // 检查是否达到目标
            if (totalLinks >= this.config.target) {
                console.log('🎉 已达到目标链接数，停止翻页');
                break;
            }

            // 特定节点：搜索页翻页
            const paginationSuccess = await this.navigateToSearchNextPage(page, pageCount);

            if (!paginationSuccess) {
                consecutiveFailures.count++;
                console.log(`❌ 翻页失败 (${consecutiveFailures.count}/${consecutiveFailures.max})`);

                if (consecutiveFailures.count >= consecutiveFailures.max) {
                    console.log('🛑 连续翻页失败次数过多，停止翻页');
                    break;
                }
            } else {
                consecutiveFailures.count = 0;
            }
        }

        return {
            target: this.config.target,
            actual: this.allLinks.size,
            success: this.allLinks.size >= this.config.target,
            searchTerm,
            metadata: {
                totalPages: pageCount,
                finalLinksCount: this.allLinks.size,
                consecutiveFailures: consecutiveFailures.count,
                captureType: 'pagination'
            },
            links: Array.from(this.allLinks).map((href, index) => ({ href, captureOrder: index + 1 }))
        };
    }

    // 特定节点：搜索页链接捕获
    async captureCurrentPageLinks(page, pageNum) {
        const newLinks = await page.evaluate((containerSelector) => {
            const containers = document.querySelectorAll(containerSelector);
            const postLinks = Array.from(containers).flatMap(container => {
                return Array.from(container.querySelectorAll('a')).filter(link => {
                    return link.href.match(/weibo\.com\/\d+\/[A-Za-z0-9_\-]+/);
                }).map(link => link.href);
            });

            return [...new Set(postLinks)]; // 去重
        }, this.config.postContainer);

        let newCount = 0;
        newLinks.forEach(link => {
            if (!this.allLinks.has(link)) {
                this.allLinks.add(link);
                newCount++;
            }
        });

        return newCount;
    }

    // 特定节点：搜索页翻页（直接URL导航）
    async navigateToSearchNextPage(page, currentPageNum) {
        try {
            console.log(`🔍 尝试直接导航到搜索结果第 ${currentPageNum + 1} 页...`);

            // 构建下一页URL
            const currentUrl = page.url();
            const nextPageUrl = currentUrl.includes('&page=')
                ? currentUrl.replace(/&page=\d+/, `&page=${currentPageNum + 1}`)
                : `${currentUrl}&page=${currentPageNum + 1}`;

            console.log(`📝 导航到: ${nextPageUrl}`);

            // 直接导航到下一页
            await page.goto(nextPageUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });

            await page.waitForTimeout(3000);

            // 验证页面是否成功加载
            const finalUrl = page.url();
            console.log(`✅ 成功导航到: ${finalUrl}`);

            return true;
        } catch (error) {
            console.log(`❌ 直接导航失败: ${error.message}`);
            return false;
        }
    }

    // 特定节点：捕获当前链接（兼容方法）
    async captureCurrentLinks(page, context) {
        return await this.captureCurrentPageLinks(page, 0);
    }

    // 通用节点：保存结果
    async saveResults(result, workflowType, metadata = {}) {
        try {
            const fs = await import('fs');
            const path = await import('path');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputDir = path.join(process.env.HOME, '.webauto', 'weibo');

            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const filename = `weibo-links-${workflowType}-${metadata.searchTerm || 'unknown'}-${timestamp}.json`;
            const filepath = path.join(outputDir, filename);

            const output = {
                ...result,
                timestamp,
                workflowType,
                method: 'Search Workflow',
                metadata: { ...metadata, ...result.metadata }
            };

            fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
            console.log(`💾 结果已保存到: ${filepath}`);

            result.savedFile = filepath;
        } catch (error) {
            console.error('❌ 保存结果失败:', error.message);
        }
    }
}

// 导出工作流
export default WeiboSearchWorkflow;

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
    const searchTerm = process.argv[2];
    if (!searchTerm) {
        console.error('❌ 请提供搜索关键词');
        console.log('用法: node weibo-search-workflow.js <搜索关键词>');
        process.exit(1);
    }

    const workflow = new WeiboSearchWorkflow();
    workflow.execute(searchTerm).then(result => {
        console.log('\n🎉 工作流执行完成!');
        console.log(`📊 结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
        console.log(`📈 捕获链接数: ${result.actual}`);
        if (result.searchTerm) {
            console.log(`🔍 搜索关键词: ${result.searchTerm}`);
        }
        if (result.savedFile) {
            console.log(`📄 结果文件: ${result.savedFile}`);
        }
    }).catch(error => {
        console.error('💥 执行失败:', error.message);
        process.exit(1);
    });
}