#!/usr/bin/env node

/**
 * Weibo Homepage Capture Test
 * 登录微博首页获取最新50条微博并保存到本地
 */

const path = require('path');
const fs = require('fs-extra');
const { WeiboPersonalHomepageTask } = require('./tasks/executors/weibo-tasks');

class WeiboHomepageCaptureTest {
    constructor() {
        this.outputDir = path.join(__dirname, 'output', 'weibo-homepage-capture');
        this.results = {
            posts: [],
            summary: {
                totalPosts: 0,
                totalImages: 0,
                totalLinks: 0,
                startTime: null,
                endTime: null,
                duration: 0
            }
        };
    }

    async initialize() {
        console.log('🚀 初始化微博首页捕获测试...');
        
        // 创建输出目录
        await fs.ensureDir(this.outputDir);
        await fs.ensureDir(path.join(this.outputDir, 'posts'));
        await fs.ensureDir(path.join(this.outputDir, 'images'));
        await fs.ensureDir(path.join(this.outputDir, 'screenshots'));
        
        console.log(`📁 输出目录: ${this.outputDir}`);
        
        // 初始化任务
        this.task = new WeiboPersonalHomepageTask({
            maxPosts: 50,
            captureImages: true,
            captureScreenshots: true,
            captureComments: true,
            enableRealtimeMonitoring: false,
            feedType: 'timeline', // 时间线
            autoScroll: true,
            scrollInterval: 2000,
            maxScrollAttempts: 20,
            retryAttempts: 3,
            outputDir: this.outputDir
        });
        
        // 监听事件
        this.setupEventListeners();
        
        await this.task.initialize();
        console.log('✅ 初始化完成');
    }

    setupEventListeners() {
        this.task.on('login_required', (data) => {
            console.log('🔐 需要登录微博');
            console.log(`   方式: ${data.method}`);
            console.log(`   URL: ${data.qrUrl || data.loginUrl}`);
        });

        this.task.on('login_success', (data) => {
            console.log('✅ 登录成功');
            console.log(`   用户: ${data.username}`);
            console.log(`   会话ID: ${data.sessionId}`);
        });

        this.task.on('post_captured', (data) => {
            const { post, index, total } = data;
            console.log(`📝 捕获微博 ${index + 1}/${total}: ${post.title?.substring(0, 50)}...`);
            this.results.posts.push(post);
        });

        this.task.on('image_captured', (data) => {
            console.log(`🖼️  图片已保存: ${data.filename}`);
            this.results.summary.totalImages++;
        });

        this.task.on('comment_expanded', (data) => {
            console.log(`💬 评论已展开: ${data.postId} (${data.commentCount}条评论)`);
        });

        this.task.on('error', (data) => {
            console.error(`❌ 错误: ${data.message}`);
            if (data.stack) {
                console.error(data.stack);
            }
        });

        this.task.on('progress', (data) => {
            const percentage = ((data.completed / data.total) * 100).toFixed(1);
            console.log(`⏳ 进度: ${percentage}% (${data.completed}/${data.total})`);
        });

        this.task.on('completed', (data) => {
            console.log('✅ 任务完成');
            console.log(`   总微博数: ${data.totalPosts}`);
            console.log(`   总图片数: ${data.totalImages}`);
            console.log(`   总链接数: ${data.totalLinks}`);
            console.log(`   用时: ${data.duration}ms`);
        });
    }

    async execute() {
        try {
            this.results.summary.startTime = new Date();
            console.log('🎯 开始执行微博首页捕获任务...');
            
            // 执行任务
            const result = await this.task.execute();
            
            this.results.summary.endTime = new Date();
            this.results.summary.duration = this.results.summary.endTime - this.results.summary.startTime;
            this.results.summary.totalPosts = result.totalPosts;
            this.results.summary.totalLinks = result.totalLinks;
            
            console.log('🎉 任务执行完成！');
            
            // 保存结果
            await this.saveResults();
            
            // 生成汇总报告
            await this.generateSummaryReport();
            
            return result;
            
        } catch (error) {
            console.error('❌ 任务执行失败:', error);
            throw error;
        }
    }

    async saveResults() {
        console.log('💾 保存捕获结果...');
        
        // 保存每条微博的详细信息
        for (let i = 0; i < this.results.posts.length; i++) {
            const post = this.results.posts[i];
            const postFilename = `post_${i + 1}_${post.id}.json`;
            const postPath = path.join(this.outputDir, 'posts', postFilename);
            
            await fs.writeFile(postPath, JSON.stringify(post, null, 2), 'utf8');
        }
        
        // 保存完整结果
        const resultsPath = path.join(this.outputDir, 'weibo_posts_complete.json');
        await fs.writeFile(resultsPath, JSON.stringify(this.results, null, 2), 'utf8');
        
        console.log(`✅ 已保存 ${this.results.posts.length} 条微博到 ${this.outputDir}/posts/`);
        console.log(`✅ 完整结果保存在: ${resultsPath}`);
    }

    async generateSummaryReport() {
        console.log('📊 生成汇总报告...');
        
        const report = {
            summary: this.results.summary,
            posts: this.results.posts.map((post, index) => ({
                index: index + 1,
                id: post.id,
                title: post.title,
                author: post.author,
                publishTime: post.publishTime,
                contentLength: post.content?.length || 0,
                imageCount: post.images?.length || 0,
                linkCount: post.links?.length || 0,
                commentCount: post.comments?.length || 0,
                repostCount: post.repostCount,
                likeCount: post.likeCount,
                filePath: `posts/post_${index + 1}_${post.id}.json`
            })),
            statistics: {
                authors: [...new Set(this.results.posts.map(p => p.author.name))].length,
                totalCharacters: this.results.posts.reduce((sum, p) => sum + (p.content?.length || 0), 0),
                averageImagesPerPost: (this.results.summary.totalImages / this.results.posts.length).toFixed(2),
                averageLinksPerPost: (this.results.summary.totalLinks / this.results.posts.length).toFixed(2),
                averageCommentsPerPost: (this.results.posts.reduce((sum, p) => sum + (p.comments?.length || 0), 0) / this.results.posts.length).toFixed(2),
                timeRange: {
                    earliest: Math.min(...this.results.posts.map(p => new Date(p.publishTime).getTime())),
                    latest: Math.max(...this.results.posts.map(p => new Date(p.publishTime).getTime()))
                }
            }
        };
        
        const reportPath = path.join(this.outputDir, 'weibo_summary_report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
        
        // 生成HTML报告
        await this.generateHtmlReport(report);
        
        console.log(`✅ 汇总报告已生成: ${reportPath}`);
    }

    async generateHtmlReport(report) {
        const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>微博首页捕获报告</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #e6162d;
            text-align: center;
            margin-bottom: 30px;
        }
        .summary {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
        }
        .summary h2 {
            margin-top: 0;
            color: #333;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: #e6162d;
        }
        .stat-label {
            color: #666;
            margin-top: 5px;
        }
        .post-list {
            margin-top: 30px;
        }
        .post-item {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
        }
        .post-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .post-title {
            font-weight: bold;
            color: #333;
        }
        .post-meta {
            color: #666;
            font-size: 0.9em;
        }
        .post-content {
            margin: 10px 0;
            color: #444;
            line-height: 1.6;
        }
        .post-stats {
            display: flex;
            gap: 20px;
            color: #666;
            font-size: 0.9em;
        }
        .timestamp {
            color: #999;
            font-size: 0.8em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 微博首页捕获报告</h1>
        
        <div class="summary">
            <h2>📊 捕获概览</h2>
            <p><strong>执行时间:</strong> ${new Date(report.summary.startTime).toLocaleString()} - ${new Date(report.summary.endTime).toLocaleString()}</p>
            <p><strong>总用时:</strong> ${report.summary.duration}ms</p>
            <p><strong>数据目录:</strong> ${this.outputDir}</p>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">${report.summary.totalPosts}</div>
                <div class="stat-label">微博总数</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.summary.totalImages}</div>
                <div class="stat-label">图片总数</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.summary.totalLinks}</div>
                <div class="stat-label">链接总数</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.statistics.authors}</div>
                <div class="stat-label">作者数量</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.statistics.totalCharacters}</div>
                <div class="stat-label">总字数</div>
            </div>
        </div>

        <div class="post-list">
            <h2>📝 微博列表</h2>
            ${report.posts.map(post => `
                <div class="post-item">
                    <div class="post-header">
                        <div class="post-title">${post.title || '无标题'}</div>
                        <div class="post-meta">#${post.index}</div>
                    </div>
                    <div class="post-content">${post.content ? post.content.substring(0, 200) + (post.content.length > 200 ? '...' : '') : '无内容'}</div>
                    <div class="post-stats">
                        <span>👤 ${post.author.name}</span>
                        <span>🖼️ ${post.imageCount}图</span>
                        <span>🔗 ${post.linkCount}链</span>
                        <span>💬 ${post.commentCount}评</span>
                        <span>🔄 ${post.repostCount}转</span>
                        <span>❤️ ${post.likeCount}赞</span>
                    </div>
                    <div class="timestamp">${new Date(post.publishTime).toLocaleString()}</div>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
        
        const htmlPath = path.join(this.outputDir, 'weibo_report.html');
        await fs.writeFile(htmlPath, html, 'utf8');
        
        console.log(`✅ HTML报告已生成: ${htmlPath}`);
    }

    async cleanup() {
        if (this.task) {
            await this.task.shutdown();
        }
        console.log('🧹 清理完成');
    }
}

// 主执行函数
async function main() {
    const test = new WeiboHomepageCaptureTest();
    
    try {
        await test.initialize();
        await test.execute();
        
        console.log('\n🎉 测试完成！');
        console.log(`📁 结果保存在: ${test.outputDir}`);
        console.log(`📄 主要文件:`);
        console.log(`   - weibo_posts_complete.json (完整数据)`);
        console.log(`   - weibo_summary_report.json (汇总报告)`);
        console.log(`   - weibo_report.html (可视化报告)`);
        console.log(`   - posts/ (每条微博的详细信息)`);
        console.log(`   - images/ (捕获的图片)`);
        console.log(`   - screenshots/ (页面截图)`);
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        process.exit(1);
    } finally {
        await test.cleanup();
    }
}

// 运行测试
if (require.main === module) {
    main();
}

module.exports = WeiboHomepageCaptureTest;