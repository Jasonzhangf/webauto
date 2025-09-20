// 滚动捕获节点
import BaseNode from './BaseNode.js';

class ScrollCaptureNode extends BaseNode {
    constructor() {
        super();
        this.name = 'ScrollCaptureNode';
        this.description = '滚动页面并捕获链接';
    }

    async execute(context) {
        const { config, logger, page, variables } = context;

        try {
            logger.info('🔄 开始滚动捕获...');

            const target = config.target || 50;
            const postContainer = config.postContainer;
            const maxScrollAttempts = config.maxScrollAttempts || 200;
            const scrollStep = config.scrollStep || 3;
            const scrollDelay = config.scrollDelay || 1000;
            const noNewLinksLimit = config.noNewLinksLimit || 5;
            const linkPattern = config.linkPattern || 'weibo\\.com\\/\\d+\\/[A-Za-z0-9_\\-]+';

            // 初始化变量
            let scrollCount = 0;
            let noNewLinksCount = 0;
            const allLinks = new Set();

            // 获取现有链接
            const existingLinks = variables.get('capturedLinks') || [];
            existingLinks.forEach(link => allLinks.add(link));

            // 初始捕获
            await this.captureLinks(page, allLinks, postContainer, linkPattern, '初始状态');

            logger.info(`📊 目标链接数: ${target}, 当前链接数: ${allLinks.size}`);

            // 滚动捕获
            while (scrollCount < maxScrollAttempts && allLinks.size < target && noNewLinksCount < noNewLinksLimit) {
                scrollCount++;

                // 执行滚动
                for (let i = 0; i < scrollStep; i++) {
                    await page.keyboard.press('PageDown');
                    await this.sleep(200);
                }

                await this.sleep(scrollDelay);

                // 捕获链接
                const newCount = await this.captureLinks(page, allLinks, postContainer, linkPattern, `滚动 ${scrollCount}`);

                if (newCount === 0) {
                    noNewLinksCount++;
                    logger.info(`   ⚠️ 无新增链接 (${noNewLinksCount}/${noNewLinksLimit})`);
                } else {
                    noNewLinksCount = 0;
                    logger.info(`   ✅ 新增 ${newCount} 个链接 (总计: ${allLinks.size})`);
                }

                // 检查是否到底
                if (await this.checkIfAtBottom(page)) {
                    logger.info('   📜 已到达页面底部');
                    break;
                }

                // 检查是否达到目标
                if (allLinks.size >= target) {
                    logger.info('   🎉 已达到目标链接数');
                    break;
                }
            }

            const finalLinks = Array.from(allLinks).map((href, index) => ({
                href: href,
                captureOrder: index + 1
            }));

            logger.info(`✅ 滚动捕获完成，共捕获 ${finalLinks.length} 个链接`);

            return {
                success: true,
                variables: {
                    capturedLinks: finalLinks,
                    scrollCount: scrollCount,
                    totalLinks: finalLinks.length,
                    targetReached: finalLinks.length >= target,
                    scrollCompleted: true
                },
                results: {
                    links: finalLinks,
                    scrollCount: scrollCount,
                    target: target,
                    actual: finalLinks.length
                }
            };

        } catch (error) {
            logger.error(`❌ 滚动捕获失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async captureLinks(page, allLinks, containerSelector, linkPattern, context) {
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

    async checkIfAtBottom(page) {
        const state = await page.evaluate(() => ({
            scrollY: window.scrollY,
            pageHeight: document.body.scrollHeight,
            viewportHeight: window.innerHeight
        }));

        const scrollBuffer = 200;
        return state.scrollY + state.viewportHeight >= state.pageHeight - scrollBuffer;
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
                maxScrollAttempts: {
                    type: 'number',
                    description: '最大滚动次数',
                    default: 200
                },
                scrollStep: {
                    type: 'number',
                    description: '滚动步长',
                    default: 3
                },
                scrollDelay: {
                    type: 'number',
                    description: '滚动延迟（毫秒）',
                    default: 1000
                },
                noNewLinksLimit: {
                    type: 'number',
                    description: '无新增链接限制',
                    default: 5
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
                name: 'totalLinks',
                type: 'number',
                description: '总链接数'
            },
            {
                name: 'targetReached',
                type: 'boolean',
                description: '是否达到目标'
            }
        ];
    }
}

export default ScrollCaptureNode;