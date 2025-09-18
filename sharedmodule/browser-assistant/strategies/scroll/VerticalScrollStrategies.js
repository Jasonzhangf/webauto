/**
 * 垂直滚动策略 - 支持无限滚动和分页滚动
 */

/**
 * 垂直无限滚动策略
 */
class VerticalInfiniteScrollStrategy {
    constructor(architecture) {
        this.architecture = architecture;
        this.securityManager = architecture.securityManager;
        this.performanceMonitor = architecture.performanceMonitor;
    }

    async execute(page, options = {}) {
        const {
            maxItems = 100,
            maxScrolls = 20,
            scrollDelay = 2000,
            scrollAmount = '80vh',
            detectNextPage = true,
            itemSelector,
            containerSelector = 'body'
        } = options;

        console.log('🔄 开始垂直无限滚动...');

        let collectedItems = [];
        let scrollCount = 0;
        let noNewItemsCount = 0;
        let currentPage = 1;
        let reachedEnd = false;

        while (scrollCount < maxScrolls && !reachedEnd && collectedItems.length < maxItems) {
            try {
                // 安全检查
                const securityCheck = await this.securityManager.checkBeforeOperation(page, { type: 'scroll' });
                if (!securityCheck.allowed) {
                    console.error(`❌ 安全检查失败: ${securityCheck.reason}`);
                    break;
                }

                // 滚动前等待
                await this.securityManager.addRandomDelay(1000, 3000);

                // 执行滚动
                const scrollResult = await this.performScroll(page, {
                    scrollAmount,
                    containerSelector
                });

                // 等待新内容加载
                await this.securityManager.addRandomDelay(scrollDelay - 500, scrollDelay + 1000);

                // 检测新内容
                const newItems = await this.detectNewItems(page, {
                    itemSelector,
                    previousCount: collectedItems.length
                });

                if (newItems.length > 0) {
                    collectedItems = [...collectedItems, ...newItems];
                    noNewItemsCount = 0;
                    console.log(`📦 获取到 ${newItems.length} 个新项目，总计: ${collectedItems.length}`);
                } else {
                    noNewItemsCount++;
                    console.log(`⚠️ 未检测到新内容 (${noNewItemsCount}/3)`);
                }

                // 检查是否到达页面底部
                if (detectNextPage) {
                    const nextPageDetected = await this.detectNextPage(page);
                    if (nextPageDetected) {
                        console.log(`📄 检测到下一页，尝试翻页...`);
                        const pageTurnResult = await this.turnPage(page);
                        if (pageTurnResult.success) {
                            currentPage++;
                            noNewItemsCount = 0;
                            scrollCount = 0; // 重置滚动计数
                        }
                    }
                }

                // 检查是否到达页面底部
                const atBottom = await this.isAtBottom(page);
                if (atBottom) {
                    console.log('📜 已到达页面底部');
                    reachedEnd = true;
                }

                // 连续3次没有新内容，结束滚动
                if (noNewItemsCount >= 3) {
                    console.log('🎯 连续3次无新内容，结束滚动');
                    break;
                }

                scrollCount++;

            } catch (error) {
                console.error('❌ 滚动过程中出错:', error.message);
                await this.securityManager.handleOperationError(page, { type: 'scroll' }, error);
                break;
            }
        }

        console.log(`✅ 滚动完成，总计获取 ${collectedItems.length} 个项目`);

        return {
            success: true,
            items: collectedItems,
            scrollCount,
            currentPage,
            reachedEnd,
            collectedItems: collectedItems.length
        };
    }

    /**
     * 执行滚动操作
     */
    async performScroll(page, options) {
        const { scrollAmount, containerSelector } = options;

        return await page.evaluate(({ scrollAmount, containerSelector }) => {
            const container = containerSelector === 'body' ? 
                document.body : 
                document.querySelector(containerSelector);

            if (!container) {
                throw new Error(`Container not found: ${containerSelector}`);
            }

            // 解析滚动量
            let scrollPx;
            if (typeof scrollAmount === 'string' && scrollAmount.endsWith('vh')) {
                scrollPx = window.innerHeight * parseInt(scrollAmount) / 100;
            } else {
                scrollPx = parseInt(scrollAmount);
            }

            // 平滑滚动
            const startScrollTop = container.scrollTop;
            const targetScrollTop = startScrollTop + scrollPx;
            const duration = 800 + Math.random() * 400; // 800-1200ms

            return new Promise((resolve) => {
                const startTime = Date.now();
                
                function animate() {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    // 使用缓动函数
                    const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
                    const currentScrollTop = startScrollTop + (targetScrollTop - startScrollTop) * easeInOutCubic(t);
                    
                    container.scrollTop = currentScrollTop;
                    
                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        resolve({
                            startScrollTop,
                            endScrollTop: container.scrollTop,
                            scrollAmount: container.scrollTop - startScrollTop
                        });
                    }
                }
                
                requestAnimationFrame(animate);
            });
        }, { scrollAmount, containerSelector });
    }

    /**
     * 检测新项目
     */
    async detectNewItems(page, options) {
        const { itemSelector, previousCount } = options;

        if (!itemSelector) {
            return [];
        }

        try {
            const items = await page.evaluate(({ itemSelector }) => {
                const elements = document.querySelectorAll(itemSelector);
                return Array.from(elements).map((element, index) => ({
                    index,
                    textContent: element.textContent?.trim() || '',
                    boundingRect: element.getBoundingClientRect(),
                    isVisible: element.offsetParent !== null
                }));
            }, { itemSelector });

            // 过滤可见元素
            const visibleItems = items.filter(item => item.isVisible);

            // 只返回新增的项目
            if (visibleItems.length > previousCount) {
                return visibleItems.slice(previousCount);
            }

            return [];

        } catch (error) {
            console.error('检测新项目失败:', error.message);
            return [];
        }
    }

    /**
     * 检测下一页
     */
    async detectNextPage(page) {
        const nextPageSelectors = [
            '.next-page',
            '.pagination .next',
            '.pager .next',
            '[aria-label*="next"]',
            '[title*="next"]',
            'a[href*="page="]:not([href*="page=1"])',
            '.load-more',
            '.view-more'
        ];

        try {
            for (const selector of nextPageSelectors) {
                const element = await page.$(selector);
                if (element) {
                    const isVisible = await element.isVisible();
                    const isEnabled = await element.isEnabled();
                    
                    if (isVisible && isEnabled) {
                        return {
                            found: true,
                            selector,
                            element
                        };
                    }
                }
            }

            return { found: false };

        } catch (error) {
            console.error('检测下一页失败:', error.message);
            return { found: false };
        }
    }

    /**
     * 翻页操作
     */
    async turnPage(page) {
        try {
            const nextPageInfo = await this.detectNextPage(page);
            
            if (!nextPageInfo.found) {
                return { success: false, reason: '未找到下一页按钮' };
            }

            // 滚动到按钮位置
            await nextPageInfo.element.scrollIntoViewIfNeeded();
            await this.securityManager.addRandomDelay(500, 1000);

            // 点击按钮
            await nextPageInfo.element.click();
            await this.securityManager.addRandomDelay(2000, 4000);

            // 等待页面加载
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
                .catch(() => console.log('⚠️ 页面加载超时，继续执行'));

            return { success: true };

        } catch (error) {
            console.error('翻页失败:', error.message);
            return { success: false, reason: error.message };
        }
    }

    /**
     * 检查是否到达页面底部
     */
    async isAtBottom(page) {
        return await page.evaluate(() => {
            const scrollPosition = window.scrollY || window.pageYOffset;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            
            // 距离底部100px内认为到达底部
            return scrollPosition + windowHeight >= documentHeight - 100;
        });
    }
}

/**
 * 垂直分页滚动策略
 */
class VerticalPaginatedScrollStrategy {
    constructor(architecture) {
        this.architecture = architecture;
        this.securityManager = architecture.securityManager;
    }

    async execute(page, options = {}) {
        const {
            maxPages = 10,
            scrollDelay = 2000,
            itemSelector,
            pageSelectors = [
                '.next-page',
                '.pagination .next',
                '.pager .next',
                '[aria-label*="next"]'
            ]
        } = options;

        console.log('📄 开始垂直分页滚动...');

        let collectedItems = [];
        let currentPage = 1;
        let hasMorePages = true;

        while (currentPage <= maxPages && hasMorePages) {
            try {
                // 安全检查
                const securityCheck = await this.securityManager.checkBeforeOperation(page, { type: 'scroll' });
                if (!securityCheck.allowed) {
                    console.error(`❌ 安全检查失败: ${securityCheck.reason}`);
                    break;
                }

                // 等待页面加载
                await this.securityManager.addRandomDelay(1000, 2000);

                // 提取当前页面内容
                const pageItems = await this.extractPageItems(page, { itemSelector });
                collectedItems = [...collectedItems, ...pageItems];

                console.log(`📄 第 ${currentPage} 页: 获取 ${pageItems.length} 个项目`);

                // 检查是否有下一页
                const nextPageResult = await this.findAndClickNextPage(page, { pageSelectors });
                
                if (nextPageResult.success) {
                    currentPage++;
                    await this.securityManager.addRandomDelay(scrollDelay, scrollDelay + 2000);
                } else {
                    hasMorePages = false;
                    console.log('🎯 已到达最后一页');
                }

            } catch (error) {
                console.error('❌ 分页滚动过程中出错:', error.message);
                await this.securityManager.handleOperationError(page, { type: 'scroll' }, error);
                break;
            }
        }

        console.log(`✅ 分页滚动完成，总计 ${currentPage - 1} 页，${collectedItems.length} 个项目`);

        return {
            success: true,
            items: collectedItems,
            totalPages: currentPage - 1,
            collectedItems: collectedItems.length
        };
    }

    /**
     * 提取当前页面项目
     */
    async extractPageItems(page, options) {
        const { itemSelector } = options;

        if (!itemSelector) {
            return [];
        }

        try {
            return await page.evaluate(({ itemSelector }) => {
                const elements = document.querySelectorAll(itemSelector);
                return Array.from(elements).map((element, index) => ({
                    index,
                    textContent: element.textContent?.trim() || '',
                    boundingRect: element.getBoundingClientRect(),
                    isVisible: element.offsetParent !== null
                })).filter(item => item.isVisible);
            }, { itemSelector });

        } catch (error) {
            console.error('提取页面项目失败:', error.message);
            return [];
        }
    }

    /**
     * 查找并点击下一页
     */
    async findAndClickNextPage(page, options) {
        const { pageSelectors } = options;

        try {
            for (const selector of pageSelectors) {
                const elements = await page.$$(selector);
                
                for (const element of elements) {
                    const isVisible = await element.isVisible();
                    const isEnabled = await element.isEnabled();
                    const text = await element.textContent();
                    
                    // 检查是否为下一页按钮
                    if (isVisible && isEnabled && 
                        (text.includes('下一页') || text.includes('Next') || text.includes('›') || text.includes('»'))) {
                        
                        // 滚动到按钮
                        await element.scrollIntoViewIfNeeded();
                        await this.securityManager.addRandomDelay(500, 1000);
                        
                        // 点击按钮
                        await element.click();
                        
                        // 等待页面跳转
                        await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
                            .catch(() => console.log('⚠️ 页面跳转超时，继续执行'));
                        
                        return { success: true, selector };
                    }
                }
            }

            return { success: false, reason: '未找到下一页按钮' };

        } catch (error) {
            console.error('查找下一页失败:', error.message);
            return { success: false, reason: error.message };
        }
    }
}

module.exports = {
    VerticalInfiniteScrollStrategy,
    VerticalPaginatedScrollStrategy
};