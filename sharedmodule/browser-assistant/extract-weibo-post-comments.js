#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function extractWeiboPostComments() {
    console.log('💬 提取微博帖子评论...\n');
    
    // 目标URL
    const targetUrl = 'https://weibo.com/2656274875/Q4qEJBc6z#comment';
    
    // 加载现有cookie
    const cookieFile = path.join(process.env.HOME || '~', '.webauto', 'cookies', 'weibo.com.json');
    let existingCookies = [];
    
    try {
        const cookieData = await fs.readFile(cookieFile, 'utf8');
        existingCookies = JSON.parse(cookieData);
        console.log(`✅ 加载了 ${existingCookies.length} 个Cookie`);
    } catch (error) {
        console.log('❌ 未找到Cookie文件，需要重新登录');
        return;
    }
    
    const browser = await chromium.launch({ 
        headless: false,
        viewport: { width: 1920, height: 1080 }
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    await context.addCookies(existingCookies);
    
    const page = await context.newPage();
    
    try {
        // 导航到目标帖子
        console.log('🌐 导航到目标微博帖子...');
        await page.goto(targetUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        await page.waitForTimeout(3000);
        
        // 检查页面状态
        const currentUrl = page.url();
        const pageTitle = await page.title();
        
        console.log(`📍 当前页面: ${pageTitle}`);
        console.log(`🔗 当前URL: ${currentUrl}`);
        
        // 检查是否需要登录
        if (currentUrl.includes('login') || currentUrl.includes('signin')) {
            console.log('❌ 需要登录，Cookie可能已失效');
            return;
        }
        
        console.log('✅ 成功访问帖子页面');
        
        // 等待评论加载
        console.log('\n⏳ 等待评论区加载...');
        await page.waitForTimeout(5000);
        
        // 尝试滚动到评论区
        console.log('📜 滚动到评论区...');
        await page.evaluate(() => {
            // 寻找评论区并滚动到那里
            const commentSection = document.querySelector('[class*="comment"], [class*="Comment"], .comments, #comment');
            if (commentSection) {
                commentSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                // 如果没有找到评论区，滚动到页面底部
                window.scrollTo(0, document.body.scrollHeight);
            }
        });
        
        await page.waitForTimeout(3000);
        
        // 尝试点击"加载更多"按钮
        console.log('🔄 尝试加载更多评论...');
        const loadMoreButtons = await page.$$(
            'button:has-text("加载更多"), button:has-text("更多评论"), a:has-text("查看更多"), [class*="load-more"]'
        );
        
        for (const button of loadMoreButtons) {
            try {
                await button.click();
                await page.waitForTimeout(2000);
                console.log('✅ 点击了加载更多按钮');
            } catch (error) {
                console.log('⚠️ 点击加载更多按钮失败');
            }
        }
        
        // 多次滚动以加载更多评论
        console.log('\n📜 开始滚动加载更多评论...');
        for (let i = 0; i < 10; i++) {
            await page.evaluate(() => {
                window.scrollBy(0, 800);
            });
            await page.waitForTimeout(3000);
            console.log(`   滚动 ${i + 1}/10 完成`);
            
            // 每滚动几次尝试点击加载更多
            if (i % 3 === 0) {
                try {
                    const loadMoreButtons = await page.$$(
                        'button:has-text("加载更多"), button:has-text("更多评论"), a:has-text("查看更多"), [class*="load-more"], [class*="more"]'
                    );
                    for (const button of loadMoreButtons) {
                        try {
                            await button.click();
                            console.log('   ✅ 点击了加载更多按钮');
                            await page.waitForTimeout(2000);
                        } catch (error) {
                            // 按钮可能已不可见
                        }
                    }
                } catch (error) {
                    // 继续滚动
                }
            }
        }
        
        // 提取评论内容
        console.log('\n🎯 提取评论内容...');
        
        const comments = await page.evaluate(() => {
            const results = {
                postInfo: {},
                comments: [],
                replies: [],
                pageStats: {
                    totalComments: 0,
                    totalReplies: 0,
                    scrollHeight: document.body.scrollHeight,
                    scrollTop: window.scrollY
                }
            };
            
            // 提取帖子信息
            const postContent = document.querySelector('[class*="content"], [class*="text"], .Feed_body__3R0rO, .card-feed');
            if (postContent) {
                results.postInfo.content = postContent.textContent?.trim()?.substring(0, 200) || '';
            }
            
            const postAuthor = document.querySelector('a[href*="/u/"], a[href*="/n/"]');
            if (postAuthor) {
                results.postInfo.author = postAuthor.textContent?.trim() || '';
                results.postInfo.authorLink = postAuthor.href || '';
            }
            
            // 评论选择器 - 更全面的覆盖
            const commentSelectors = [
                '[class*="comment"]',
                '[class*="Comment"]',
                '.comment-item',
                '.reply-item',
                '[data-commentid]',
                '[class*="feed-comment"]',
                '[class*="feedback"]',
                '[class*="react"]',
                '.woo-box-flex.woo-box-alignCenter.woo-box-spaceBetween',
                '[data-feedid]',
                '[class*="card"]',
                '[class*="item"]'
            ];
            
            // 记录找到的元素
            let totalElementsFound = 0;
            let potentialComments = [];
            
            // 提取评论
            commentSelectors.forEach(selector => {
                const items = document.querySelectorAll(selector);
                totalElementsFound += items.length;
                
                items.forEach((item, index) => {
                    // 尝试提取评论内容 - 使用更多选择器
                    const contentElement = item.querySelector('[class*="content"], [class*="text"], .text, .comment-text, span, div');
                    const content = contentElement?.textContent?.trim();
                    
                    // 提取评论者信息
                    const authorElement = item.querySelector('a[href*="/u/"], a[href*="/n/"], [class*="user"], [class*="author"]');
                    const authorName = authorElement?.textContent?.trim();
                    const authorLink = authorElement?.href;
                    
                    // 提取时间
                    const timeElement = item.querySelector('[class*="time"], [class*="date"], time, [class*="ago"]');
                    const time = timeElement?.textContent?.trim();
                    
                    // 提取点赞数
                    const likeElement = item.querySelector('[class*="like"], [class*="thumb"], [class*="up"], [class*="good"]');
                    const likes = likeElement?.textContent?.trim() || '0';
                    
                    // 更严格的内容判断 - 只保留真正的评论
                    if (content && content.length > 3 && 
                        !content.includes('展开') && !content.includes('返回') && 
                        !content.includes('关注') && !content.includes('粉丝') && 
                        !content.includes('微博') && !content.includes('热搜') && 
                        !content.includes('我的') && !content.includes('来自') && 
                        !content.includes('高清') && !content.includes('标清') && 
                        !content.includes('x（默认）') && !content.includes('分享') && 
                        !content.includes('同时转发') && !content.includes('帮助中心') && 
                        !content.includes('合作&服务') && !content.includes('举报中心') && 
                        !content.includes('关于微博') && !content.includes('复制视频地址') && 
                        !content.includes('取消') && !content.includes('添加') && 
                        !content.includes('央视新闻') && !content.includes('电视-电视频道') && 
                        !content.match(/^\d+$/) && !content.match(/^\d+\.\d+x$/) && 
                        !content.match(/^NEW$/) && !content.match(/^公开$/)) {
                        const commentData = {
                            content: content.substring(0, 300),
                            author: authorName || '匿名用户',
                            authorLink: authorLink || '',
                            time: time || '',
                            likes: likes,
                            selector: selector,
                            index: potentialComments.length + 1
                        };
                        
                        potentialComments.push(commentData);
                    }
                });
            });
            
            // 去重并分类
            const uniqueComments = [];
            const seenContents = new Set();
            
            potentialComments.forEach(comment => {
                if (!seenContents.has(comment.content)) {
                    seenContents.add(comment.content);
                    
                    // 判断是主评论还是回复
                    const isReply = comment.selector.includes('reply') || comment.selector.includes('sub');
                    
                    if (isReply) {
                        results.replies.push(comment);
                    } else {
                        results.comments.push(comment);
                    }
                }
            });
            
            console.log(`DEBUG: 找到 ${totalElementsFound} 个元素，其中 ${potentialComments.length} 个可能是评论`);
            
            // 统计
            results.pageStats.totalComments = results.comments.length;
            results.pageStats.totalReplies = results.replies.length;
            
            return results;
        });
        
        console.log('\n📊 提取结果:');
        console.log(`   页面高度: ${comments.pageStats.scrollHeight}px`);
        console.log(`   主评论数: ${comments.pageStats.totalComments}`);
        console.log(`   回复数: ${comments.pageStats.totalReplies}`);
        
        // 显示帖子信息
        if (comments.postInfo.content) {
            console.log('\n📝 帖子信息:');
            console.log('=' * 60);
            console.log(`作者: ${comments.postInfo.author || '未知'}`);
            console.log(`内容: ${comments.postInfo.content}...`);
            console.log('');
        }
        
        // 显示主评论
        if (comments.comments.length > 0) {
            console.log('💬 主评论:');
            console.log('=' * 60);
            comments.comments.slice(0, 5).forEach((comment, index) => {
                console.log(`${index + 1}. ${comment.author}`);
                console.log(`   ${comment.content}`);
                if (comment.time) {
                    console.log(`   时间: ${comment.time}`);
                }
                if (comment.likes !== '0') {
                    console.log(`   点赞: ${comment.likes}`);
                }
                console.log('');
            });
            
            if (comments.comments.length > 5) {
                console.log(`... 还有 ${comments.comments.length - 5} 条主评论`);
            }
        } else {
            console.log('\n❌ 未找到主评论');
        }
        
        // 显示回复
        if (comments.replies.length > 0) {
            console.log('\n🔁 回复:');
            console.log('=' * 60);
            comments.replies.slice(0, 3).forEach((reply, index) => {
                console.log(`${index + 1}. ${reply.author}`);
                console.log(`   ${reply.content}`);
                if (reply.time) {
                    console.log(`   时间: ${reply.time}`);
                }
                console.log('');
            });
            
            if (comments.replies.length > 3) {
                console.log(`... 还有 ${comments.replies.length - 3} 条回复`);
            }
        }
        
        // 保存结果
        const resultFile = path.join(process.env.HOME || '~', '.webauto', 'weibo-post-comments.json');
        await fs.mkdir(path.dirname(resultFile), { recursive: true });
        await fs.writeFile(resultFile, JSON.stringify(comments, null, 2));
        console.log(`\n✅ 结果已保存到: ${resultFile}`);
        
        console.log('\n🎉 微博帖子评论提取完成！');
        
    } catch (error) {
        console.error('❌ 提取过程中出错:', error.message);
    } finally {
        await browser.close();
        console.log('\n🧹 浏览器已关闭');
    }
}

extractWeiboPostComments().catch(console.error);