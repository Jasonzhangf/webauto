#!/usr/bin/env node

/**
 * 微博链接爬取Workflow使用示例
 * 演示如何使用workflow进行不同类型的链接爬取任务
 */

const WeiboLinkScrapingWorkflow = require('./weibo-link-scraping-workflow.cjs');

/**
 * 示例1: 基本的主页链接爬取
 */
async function basicHomepageScraping() {
    console.log('🏠 示例1: 基本的主页链接爬取');

    const workflow = new WeiboLinkScrapingWorkflow({
        maxLinks: 50,  // 限制爬取的链接数量
        enableAutoScroll: true,
        enableAutoPagination: false
    });

    try {
        // 执行完整的爬取流程
        const results = await workflow.runFullScraping({
            targets: ['homepage'],
            exportResults: true
        });

        console.log(`爬取完成！总共发现 ${results.length} 个结果集`);

        // 访问具体的链接数据
        results.forEach((result, index) => {
            console.log(`结果集 ${index + 1}:`);
            console.log(`  - 链接数量: ${result.links?.length || 0}`);
            console.log(`  - 执行时间: ${result.executionTime}ms`);
        });

    } catch (error) {
        console.error('主页链接爬取失败:', error);
    }
}

/**
 * 示例2: 搜索结果链接爬取
 */
async function searchResultsScraping() {
    console.log('🔍 示例2: 搜索结果链接爬取');

    const workflow = new WeiboLinkScrapingWorkflow({
        maxLinks: 30,
        enableAutoScroll: false,
        enableAutoPagination: true,
        scrapingConfig: {
            paginationMode: 'button'
        }
    });

    try {
        const results = await workflow.runFullScraping({
            targets: ['search'],
            keywords: ['科技', '新闻', '热点'],
            exportResults: true
        });

        console.log(`搜索爬取完成！总共处理了 ${results.length} 个关键词`);

    } catch (error) {
        console.error('搜索结果链接爬取失败:', error);
    }
}

/**
 * 示例3: 自定义配置的链接爬取
 */
async function customConfigScraping() {
    console.log('⚙️ 示例3: 自定义配置的链接爬取');

    const workflow = new WeiboLinkScrapingWorkflow({
        // 自定义Cookie路径
        cookieConfig: {
            primaryPath: './custom-cookies/weibo-cookies.json',
            domain: 'weibo.com',
            essentialCookies: ['SUB', 'SCF', 'SUBP', 'ALF']
        },

        // 自定义爬取配置
        scrapingConfig: {
            maxLinks: 100,
            enableAutoScroll: true,
            scrollStep: 5,
            maxScrollAttempts: 20,
            linkPatterns: [
                'weibo.com/\\d+/[A-Za-z0-9_\\-]+',  // 微博帖子
                'weibo.com/[A-Za-z0-9_\\-]+',       // 用户主页
            ],
            excludePatterns: [
                '.*login.*',
                '.*register.*',
                '.*ad.*'
            ]
        },

        // 自定义导出配置
        exportConfig: {
            format: 'json',
            outputDir: './custom-results',
            includeMetadata: true,
            timestamp: true
        }
    });

    try {
        const results = await workflow.runFullScraping({
            targets: ['homepage'],
            exportResults: true
        });

        console.log('自定义配置爬取完成！');

    } catch (error) {
        console.error('自定义配置爬取失败:', error);
    }
}

/**
 * 示例4: 手动控制流程
 */
async function manualControlScraping() {
    console.log('🎮 示例4: 手动控制流程');

    const workflow = new WeiboLinkScrapingWorkflow({
        maxLinks: 25,
        enableAutoScroll: true,
        enableAutoPagination: false
    });

    try {
        // 手动初始化
        await workflow.initialize();

        // 手动验证登录状态
        const isLoggedIn = await workflow.verifyLoginStatus();
        console.log(`登录状态: ${isLoggedIn ? '已登录' : '未登录'}`);

        if (!isLoggedIn) {
            throw new Error('用户未登录，请检查Cookie');
        }

        // 手动执行主页爬取
        const homepageResult = await workflow.scrapeHomepageLinks();
        console.log(`主页爬取结果: ${homepageResult.links?.length || 0} 个链接`);

        // 手动导出结果
        if (homepageResult.links && homepageResult.links.length > 0) {
            const exportPath = await workflow.exportLinks(
                homepageResult.links,
                'manual-scraping-results.json'
            );
            console.log(`结果已导出到: ${exportPath}`);
        }

        // 手动清理资源
        await workflow.cleanup();

        console.log('手动控制流程完成！');

    } catch (error) {
        console.error('手动控制流程失败:', error);
        await workflow.cleanup();
    }
}

/**
 * 示例5: 批量处理多个关键词
 */
async function batchKeywordScraping() {
    console.log('📦 示例5: 批量处理多个关键词');

    const keywords = ['科技', '新闻', '体育', '娱乐', '财经'];
    const workflow = new WeiboLinkScrapingWorkflow({
        maxLinks: 20,  // 每个关键词限制20个链接
        enableAutoScroll: false,
        enableAutoPagination: true
    });

    try {
        await workflow.initialize();

        const allResults = [];

        for (const keyword of keywords) {
            console.log(`\n处理关键词: ${keyword}`);

            const result = await workflow.scrapeSearchResults(keyword);
            allResults.push({
                keyword,
                links: result.links || [],
                count: result.links?.length || 0
            });

            console.log(`  - 发现 ${result.links?.length || 0} 个链接`);

            // 避免过于频繁的请求
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // 导出批量结果
        const batchExport = {
            batchInfo: {
                keywords,
                totalKeywords: keywords.length,
                totalLinks: allResults.reduce((sum, r) => sum + r.count, 0),
                exportTime: new Date().toISOString()
            },
            results: allResults
        };

        const exportPath = await workflow.exportLinks(
            allResults.flatMap(r => r.links),
            'batch-keyword-results.json'
        );

        console.log(`\n批量处理完成！总共发现 ${batchExport.batchInfo.totalLinks} 个链接`);
        console.log(`结果已导出到: ${exportPath}`);

        await workflow.cleanup();

    } catch (error) {
        console.error('批量处理失败:', error);
        await workflow.cleanup();
    }
}

/**
 * 主函数 - 运行示例
 */
async function runExamples() {
    console.log('🚀 微博链接爬取Workflow - 使用示例');
    console.log('='.repeat(60));

    const examples = [
        { name: '基本主页链接爬取', fn: basicHomepageScraping },
        { name: '搜索结果链接爬取', fn: searchResultsScraping },
        { name: '自定义配置爬取', fn: customConfigScraping },
        { name: '手动控制流程', fn: manualControlScraping },
        { name: '批量关键词处理', fn: batchKeywordScraping }
    ];

    // 如果指定了运行特定示例
    const targetExample = process.argv[2];

    if (targetExample) {
        const exampleIndex = parseInt(targetExample) - 1;
        if (exampleIndex >= 0 && exampleIndex < examples.length) {
            console.log(`运行示例 ${targetExample}: ${examples[exampleIndex].name}\n`);
            await examples[exampleIndex].fn();
        } else {
            console.log(`无效的示例编号: ${targetExample}`);
            console.log('可用示例: 1-5');
        }
        return;
    }

    // 否则运行所有示例
    for (let i = 0; i < examples.length; i++) {
        console.log(`\n示例 ${i + 1}: ${examples[i].name}`);
        console.log('-'.repeat(40));

        try {
            await examples[i].fn();
            console.log(`✅ 示例 ${i + 1} 完成`);
        } catch (error) {
            console.error(`❌ 示例 ${i + 1} 失败: ${error.message}`);
        }

        // 示例之间添加延迟
        if (i < examples.length - 1) {
            console.log('\n⏳ 等待 3 秒后继续下一个示例...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    console.log('\n🎉 所有示例运行完成！');
}

// 如果直接运行此文件，执行示例
if (require.main === module) {
    runExamples().catch(error => {
        console.error('\n❌ 示例运行失败:', error);
        process.exit(1);
    });
}

module.exports = {
    basicHomepageScraping,
    searchResultsScraping,
    customConfigScraping,
    manualControlScraping,
    batchKeywordScraping
};