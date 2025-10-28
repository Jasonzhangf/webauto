// 分页捕获节点
import BaseNode from './BaseNode.js';
import { safeAccessManager } from '../../../dist/src/core/SafePageAccessManager.js';

class PaginationCaptureNode extends BaseNode {
    constructor() {
        super();
        this.name = 'PaginationCaptureNode';
        this.description = '分页捕获链接';
    }

    async execute(context) {
        const { config, logger, page, variables } = context;

        try {
            logger.info('🔄 开始分页捕获...');

            const target = config.target || 50;
            const postContainer = config.postContainer;
            const maxPages = config.maxPages || 10;
            const pageDelay = config.pageDelay || 3000;
            const consecutiveFailures = config.consecutiveFailures || 3;
            const linkPattern = config.linkPattern || 'weibo\\.com\\/\\d+\\/[A-Za-z0-9_\\-]+';

            // 初始化变量
            let pageCount = 0;
            let failureCount = 0;
            const allLinks = new Set();

            // 获取现有链接
            const existingLinks = variables.get('capturedLinks') || [];
            existingLinks.forEach(link => allLinks.add(link));

            // 初始捕获
            await this.captureLinks(page, allLinks, postContainer, linkPattern, '初始状态');
            pageCount++;

            logger.info(`📊 目标链接数: ${target}, 当前链接数: ${allLinks.size}`);

            // 分页捕获
            while (pageCount < maxPages && allLinks.size < target && failureCount < consecutiveFailures) {
                logger.info(`📄 处理第 ${pageCount + 1} 页...`);

                // 尝试翻页
                const paginationSuccess = await this.navigateToNextPage(page, pageCount + 1);

                if (paginationSuccess) {
                    await this.sleep(pageDelay);

                    // 捕获当前页面链接
                    const newCount = await this.captureLinks(page, allLinks, postContainer, linkPattern, `第${pageCount + 1}页`);

                    pageCount++;
                    failureCount = 0;

                    logger.info(`   ✅ 第${pageCount}页捕获: ${allLinks.size} 个链接 (新增: ${newCount})`);

                    // 检查是否达到目标
                    if (allLinks.size >= target) {
                        logger.info('   🎉 已达到目标链接数');
                        break;
                    }
                } else {
                    failureCount++;
                    logger.warn(`   ❌ 翻页失败 (${failureCount}/${consecutiveFailures})`);

                    if (failureCount >= consecutiveFailures) {
                        logger.info('   🛑 连续翻页失败次数过多，停止翻页');
                        break;
                    }
                }
            }

            const finalLinks = Array.from(allLinks).map((href, index) => ({
                href: href,
                captureOrder: index + 1
            }));

            logger.info(`✅ 分页捕获完成，共 ${pageCount} 页，${finalLinks.length} 个链接`);

            return {
                success: true,
                variables: {
                    capturedLinks: finalLinks,
                    pageCount: pageCount,
                    totalLinks: finalLinks.length,
                    targetReached: finalLinks.length >= target,
                    paginationCompleted: true
                },
                results: {
                    links: finalLinks,
                    pageCount: pageCount,
                    target: target,
                    actual: finalLinks.length
                }
            };

        } catch (error) {
            logger.error(`❌ 分页捕获失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async captureLinks(page, allLinks, containerSelector, linkPattern, context) {
        // 添加调试日志
        console.log('🔍 Debug - containerSelector:', typeof containerSelector, containerSelector);
        console.log('🔍 Debug - linkPattern:', typeof linkPattern, linkPattern);

        const newLinks = await page.evaluate(({ container, pattern }) => {
            const containers = document.querySelectorAll(container);
            const postLinks = Array.from(containers).flatMap(container => {
                return Array.from(container.querySelectorAll('a')).filter(link => {
                    return link.href && link.href.match(new RegExp(pattern));
                }).map(link => link.href);
            });

            return [...new Set(postLinks)]; // 去重
        }, { container: containerSelector, pattern: linkPattern });

        let newCount = 0;
        newLinks.forEach(link => {
            if (!allLinks.has(link)) {
                allLinks.add(link);
                newCount++;
            }
        });

        if (newCount > 0) {
            console.log(`   ${context}: 发现 ${newLinks.length} 个链接，新增 ${newCount} 个`);
        }

        return newCount;
    }

    async navigateToNextPage(page, targetPage) {
        try {
            const currentUrl = page.url();
            let nextPageUrl;

            // 构建下一页URL
            if (currentUrl.includes('&page=')) {
                nextPageUrl = currentUrl.replace(/&page=\d+/, `&page=${targetPage}`);
            } else {
                nextPageUrl = `${currentUrl}&page=${targetPage}`;
            }

            console.log(`🔍 导航到: ${nextPageUrl}`);

            // 导航到下一页
            // 使用安全访问管理器导航到下一页
            const accessResult = await safeAccessManager.safePageAccess(page, nextPageUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });

            if (!accessResult.success) {
                console.warn(`🚨 安全访问失败: ${nextPageUrl}`);
                return false;
            }

            // 验证页面是否成功加载
            await this.sleep(2000);

            // 检查URL是否变化
            const finalUrl = page.url();
            if (finalUrl !== nextPageUrl) {
                console.warn(`⚠️ URL不匹配，预期: ${nextPageUrl}, 实际: ${finalUrl}`);
                return false;
            }

            return true;

        } catch (error) {
            console.warn(`❌ 翻页失败: ${error.message}`);
            return false;
        }
    }

    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                target: {
                    type: 'number',
                    description: '目标链接数',
                    default: 50
                },
                postContainer: {
                    type: 'string',
                    description: '帖子容器选择器'
                },
                maxPages: {
                    type: 'number',
                    description: '最大页数',
                    default: 10
                },
                pageDelay: {
                    type: 'number',
                    description: '页面延迟（毫秒）',
                    default: 3000
                },
                consecutiveFailures: {
                    type: 'number',
                    description: '连续失败限制',
                    default: 3
                },
                linkPattern: {
                    type: 'string',
                    description: '链接匹配模式',
                    default: 'weibo\\.com\\/\\d+\\/[A-Za-z0-9_\\-]+'
                }
            },
            required: ['postContainer']
        };
    }

    getInputs() {
        return [
            {
                name: 'page',
                type: 'object',
                description: '页面实例'
            },
            {
                name: 'variables',
                type: 'object',
                description: '变量管理器'
            }
        ];
    }

    getOutputs() {
        return [
            {
                name: 'capturedLinks',
                type: 'array',
                description: '捕获的链接列表'
            },
            {
                name: 'pageCount',
                type: 'number',
                description: '处理的页数'
            },
            {
                name: 'totalLinks',
                type: 'number',
                description: '总链接数'
            }
        ];
    }
}

export default PaginationCaptureNode;