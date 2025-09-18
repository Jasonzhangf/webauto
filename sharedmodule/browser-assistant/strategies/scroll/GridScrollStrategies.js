/**
 * 网格滚动策略 - 支持小红书等网格布局网站
 */

/**
 * 网格无限滚动策略
 */
class GridInfiniteScrollStrategy {
    constructor(architecture) {
        this.architecture = architecture;
        this.securityManager = architecture.securityManager;
        this.performanceMonitor = architecture.performanceMonitor;
    }

    async execute(page, options = {}) {
        const {
            maxItems = 50,
            maxScrolls = 20,
            scrollDelay = 2000,
            gridItemSelector,
            gridContainerSelector,
            detectNextPage = true
        } = options;

        console.log('🔄 开始网格无限滚动...');

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

                // 等待随机延迟
                await this.securityManager.addRandomDelay(1500, 3000);

                // 执行网格滚动
                const scrollResult = await this.performGridScroll(page, {
                    gridContainerSelector,
                    scrollAmount: '60vh'
                });

                // 等待新内容加载
                await this.securityManager.addRandomDelay(scrollDelay - 500, scrollDelay + 1000);

                // 检测新网格项
                const newItems = await this.detectNewGridItems(page, {
                    gridItemSelector,
                    previousCount: collectedItems.length
                });

                if (newItems.length > 0) {
                    collectedItems = [...collectedItems, ...newItems];
                    noNewItemsCount = 0;
                    console.log(`📦 获取到 ${newItems.length} 个新网格项，总计: ${collectedItems.length}`);
                } else {
                    noNewItemsCount++;
                    console.log(`⚠️ 未检测到新网格项 (${noNewItemsCount}/3)`);
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
                console.error('❌ 网格滚动过程中出错:', error.message);
                await this.securityManager.handleOperationError(page, { type: 'scroll' }, error);
                break;
            }
        }

        console.log(`✅ 网格滚动完成，总计获取 ${collectedItems.length} 个项目`);

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
     * 执行网格滚动
     */
    async performGridScroll(page, options) {
        const { gridContainerSelector, scrollAmount } = options;

        return await page.evaluate(({ gridContainerSelector, scrollAmount }) => {
            // 寻找网格容器
            let container = document.body;
            
            if (gridContainerSelector) {
                container = document.querySelector(gridContainerSelector) || document.body;
            }

            // 解析滚动量
            let scrollPx;
            if (typeof scrollAmount === 'string' && scrollAmount.endsWith('vh')) {
                scrollPx = window.innerHeight * parseInt(scrollAmount) / 100;
            } else {
                scrollPx = parseInt(scrollAmount);
            }

            // 网格特殊滚动逻辑
            const startScrollTop = container.scrollTop;
            const targetScrollTop = startScrollTop + scrollPx;
            const duration = 1200 + Math.random() * 600; // 1200-1800ms

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
                            scrollAmount: container.scrollTop - startScrollTop,
                            containerHeight: container.scrollHeight
                        });
                    }
                }
                
                requestAnimationFrame(animate);
            });
        }, { gridContainerSelector, scrollAmount });
    }

    /**
     * 检测新网格项
     */
    async detectNewGridItems(page, options) {
        const { gridItemSelector, previousCount } = options;

        if (!gridItemSelector) {
            return [];
        }

        try {
            const items = await page.evaluate(({ gridItemSelector }) => {
                const elements = document.querySelectorAll(gridItemSelector);
                return Array.from(elements).map((element, index) => ({
                    index,
                    textContent: element.textContent?.trim() || '',
                    boundingRect: element.getBoundingClientRect(),
                    isVisible: element.offsetParent !== null,
                    inViewport: element.getBoundingClientRect().top < window.innerHeight && 
                               element.getBoundingClientRect().bottom > 0
                }));
            }, { gridItemSelector });

            // 过滤可视区域内的元素
            const visibleItems = items.filter(item => item.isVisible && item.inViewport);

            // 只返回新增的项目
            if (visibleItems.length > previousCount) {
                return visibleItems.slice(previousCount);
            }

            return [];

        } catch (error) {
            console.error('检测新网格项失败:', error.message);
            return [];
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
            
            return scrollPosition + windowHeight >= documentHeight - 200;
        });
    }
}

/**
 * 网格分页滚动策略
 */
class GridPaginatedScrollStrategy {
    constructor(architecture) {
        this.architecture = architecture;
        this.securityManager = architecture.securityManager;
    }

    async execute(page, options = {}) {
        const {
            maxPages = 10,
            scrollDelay = 2000,
            gridItemSelector,
            pageSelectors = [
                '.next-page',
                '.pagination .next',
                '.pager .next',
                '.load-more',
                '.view-more'
            ]
        } = options;

        console.log('📄 开始网格分页滚动...');

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
                await this.securityManager.addRandomDelay(2000, 4000);

                // 提取当前页面网格项
                const pageItems = await this.extractGridItems(page, { gridItemSelector });
                collectedItems = [...collectedItems, ...pageItems];

                console.log(`📄 第 ${currentPage} 页: 获取 ${pageItems.length} 个网格项`);

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
                console.error('❌ 网格分页滚动过程中出错:', error.message);
                await this.securityManager.handleOperationError(page, { type: 'scroll' }, error);
                break;
            }
        }

        console.log(`✅ 网格分页滚动完成，总计 ${currentPage - 1} 页，${collectedItems.length} 个项目`);

        return {
            success: true,
            items: collectedItems,
            totalPages: currentPage - 1,
            collectedItems: collectedItems.length
        };
    }

    /**
     * 提取网格项
     */
    async extractGridItems(page, options) {
        const { gridItemSelector } = options;

        if (!gridItemSelector) {
            return [];
        }

        try {
            return await page.evaluate(({ gridItemSelector }) => {
                const elements = document.querySelectorAll(gridItemSelector);
                return Array.from(elements).map((element, index) => ({
                    index,
                    textContent: element.textContent?.trim() || '',
                    boundingRect: element.getBoundingClientRect(),
                    isVisible: element.offsetParent !== null,
                    inViewport: element.getBoundingClientRect().top < window.innerHeight && 
                               element.getBoundingClientRect().bottom > 0
                })).filter(item => item.isVisible && item.inViewport);
            }, { gridItemSelector });

        } catch (error) {
            console.error('提取网格项失败:', error.message);
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
                    
                    if (isVisible && isEnabled) {
                        // 滚动到按钮
                        await element.scrollIntoViewIfNeeded();
                        await this.securityManager.addRandomDelay(800, 1500);
                        
                        // 点击按钮
                        await element.click();
                        
                        // 等待页面加载
                        await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
                            .catch(() => console.log('⚠️ 页面加载超时，继续执行'));
                        
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
    GridInfiniteScrollStrategy,
    GridPaginatedScrollStrategy
};