/**
 * 微博批量下载和合并工作流
 * 获取50条链接 -> 批量下载内容 -> 合并为文档
 */

const { createTestSystem, validateCookieFile } = require('../tests/utils/test-helpers.cjs');
const { TEST_CONFIG } = require('../tests/utils/test-config.cjs');
const fs = require('fs');
const path = require('path');

async function weiboBatchDownloadWorkflow() {
  console.log('🚀 开始微博批量下载工作流...');

  // 验证Cookie
  const cookieValidation = validateCookieFile();
  if (!cookieValidation.valid) {
    throw new Error('Cookie验证失败');
  }

  console.log(`✅ Cookie验证成功 (${cookieValidation.count} 个Cookie)`);

  // 创建测试系统并启用详细日志
  const testSystem = createTestSystem({
    logLevel: 'debug', // 启用详细日志
    headless: false,
    timeout: 0 // 取消整个操作的超时限制
  });

  // 创建工作流日志文件
  const workflowLogFile = `${TEST_CONFIG.paths.outputDir}/workflow-log-${Date.now()}.json`;
  const workflowLog = {
    startTime: new Date().toISOString(),
    steps: [],
    errors: [],
    status: 'started'
  };

  // 记录日志函数
  const logStep = (step, details) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      step,
      details
    };
    workflowLog.steps.push(logEntry);
    fs.writeFileSync(workflowLogFile, JSON.stringify(workflowLog, null, 2));
    console.log(`📝 记录步骤: ${step}`);
  };

  const logError = (step, error) => {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      step,
      error: error.message,
      stack: error.stack
    };
    workflowLog.errors.push(errorEntry);
    fs.writeFileSync(workflowLogFile, JSON.stringify(workflowLog, null, 2));
    console.error(`📝 记录错误: ${step} - ${error.message}`);
  };

  try {
    await testSystem.initialize();

    // 第一步：获取50条链接
    console.log('\n🔗 第一步：获取50条微博链接...');
    logStep('开始获取链接', { targetCount: 50 });

    const postLinks = await getPostLinks(testSystem, 50);

    if (postLinks.length < 50) {
      console.log(`⚠️  只获取到 ${postLinks.length} 条链接，继续执行...`);
      logStep('链接获取完成', { targetCount: 50, actualCount: postLinks.length, status: 'partial' });
    } else {
      console.log(`✅ 成功获取 ${postLinks.length} 条链接`);
      logStep('链接获取完成', { targetCount: 50, actualCount: postLinks.length, status: 'success' });
    }

    // 第二步：批量下载内容
    console.log('\n📥 第二步：批量下载微博内容...');
    logStep('开始批量下载', { totalLinks: postLinks.length });

    const downloadedPosts = await batchDownloadPosts(testSystem, postLinks);

    console.log(`✅ 成功下载 ${downloadedPosts.length} 条微博内容`);
    logStep('批量下载完成', {
      totalLinks: postLinks.length,
      successCount: downloadedPosts.length,
      successRate: ((downloadedPosts.length / postLinks.length) * 100).toFixed(1) + '%'
    });

    // 第三步：合并为文档
    console.log('\n📄 第三步：生成合并文档...');
    logStep('开始生成文档', { postCount: downloadedPosts.length });

    const mergedDocument = await generateMergedDocument(downloadedPosts);

    console.log(`✅ 合并文档已生成: ${mergedDocument}`);
    logStep('文档生成完成', { documentPath: mergedDocument });

    // 工作流总结
    console.log('\n📊 工作流执行结果:');
    console.log(`- 获取链接数: ${postLinks.length}`);
    console.log(`- 成功下载: ${downloadedPosts.length}`);
    console.log(`- 下载成功率: ${((downloadedPosts.length / postLinks.length) * 100).toFixed(1)}%`);

    // 更新工作流日志
    workflowLog.status = 'completed';
    workflowLog.endTime = new Date().toISOString();
    workflowLog.results = {
      totalLinks: postLinks.length,
      downloadedPosts: downloadedPosts.length,
      successRate: ((downloadedPosts.length / postLinks.length) * 100).toFixed(1) + '%',
      documentPath: mergedDocument
    };
    fs.writeFileSync(workflowLogFile, JSON.stringify(workflowLog, null, 2));

    logStep('工作流完成', {
      totalLinks: postLinks.length,
      downloadedPosts: downloadedPosts.length,
      successRate: ((downloadedPosts.length / postLinks.length) * 100).toFixed(1) + '%',
      documentPath: mergedDocument,
      workflowLogFile
    });

    return {
      timestamp: new Date().toISOString(),
      totalLinks: postLinks.length,
      downloadedPosts: downloadedPosts.length,
      successRate: (downloadedPosts.length / postLinks.length) * 100,
      documentPath: mergedDocument,
      workflowLogFile
    };

  } catch (error) {
    console.error('❌ 工作流执行失败:', error.message);
    logError('工作流失败', error);
    workflowLog.status = 'failed';
    workflowLog.endTime = new Date().toISOString();
    workflowLog.failureReason = error.message;
    fs.writeFileSync(workflowLogFile, JSON.stringify(workflowLog, null, 2));
    throw error;
  } finally {
    await testSystem.cleanup();
  }
}

// 获取微博链接
async function getPostLinks(testSystem, targetCount = 50) {
  console.log('🔍 访问微博主页...');
  await testSystem.state.page.goto(TEST_CONFIG.urls.homepage, {
    waitUntil: 'domcontentloaded',
    timeout: 15000
  });

  await testSystem.state.page.waitForTimeout(10000);

  console.log('🔄 滚动页面加载内容...');
  const allLinks = new Set();
  let scrollCount = 0;
  const maxScrolls = 20; // 限制滚动次数

  while (allLinks.size < targetCount && scrollCount < maxScrolls) {
    console.log(`🔄 第 ${scrollCount + 1} 次滚动...`);

    // 使用pagedown滚动
    await testSystem.state.page.keyboard.press('PageDown');
    await testSystem.state.page.waitForTimeout(5000);

    // 提取当前页面的链接
    const currentLinks = await testSystem.state.page.evaluate(() => {
      const linkElements = document.querySelectorAll('a[href*="weibo.com"]');
      const validLinks = new Set();

      linkElements.forEach(link => {
        const href = link.href;
        if (href && href.includes('weibo.com')) {
          const cleanUrl = href.split('?')[0].split('#')[0];
          validLinks.add(cleanUrl);
        }
      });

      return Array.from(validLinks);
    });

    // 过滤出真正的帖子链接
    const postLinks = currentLinks.filter(link => {
      // 只匹配具体的帖子格式：/数字/字母组合 或 /用户名/字母组合
      const isPostFormat = link.match(/weibo\.com\/\d+\/[A-Za-z0-9]+$/) ||
                          link.match(/weibo\.com\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/);

      // 排除个人主页和话题页
      const isNotExcluded = !link.includes('/u/') &&
                           !link.includes('/p/') &&
                           !link.includes('service.account.weibo.com') &&
                           !link.includes('weibo.com/signup') &&
                           !link.includes('weibo.com/login') &&
                           !link.includes('weibo.com/home') &&
                           !link.includes('weibo.com/explore') &&
                           !link.includes('me.weibo.com');

      return isPostFormat && isNotExcluded;
    });

    // 添加到总集合
    postLinks.forEach(link => allLinks.add(link));

    scrollCount++;

    console.log(`当前链接数: ${allLinks.size}/${targetCount}`);

    // 检查页面状态
    try {
      await testSystem.state.page.waitForFunction(() => {
        return document.readyState === 'complete';
      }, { timeout: 30000 });
    } catch (error) {
      console.log('页面状态检查超时，继续执行');
    }
  }

  const finalLinks = Array.from(allLinks).slice(0, targetCount);
  console.log(`最终获取到 ${finalLinks.length} 条链接`);

  // 保存链接列表
  const linksFile = `${TEST_CONFIG.paths.outputDir}/weibo-links-${Date.now()}.json`;
  fs.writeFileSync(linksFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    links: finalLinks
  }, null, 2));
  console.log(`链接已保存到: ${linksFile}`);

  return finalLinks;
}

// 批量下载微博内容
async function batchDownloadPosts(testSystem, postLinks) {
  const downloadedPosts = [];
  const downloadDir = path.join(TEST_CONFIG.paths.outputDir, 'downloaded-posts');

  // 创建下载目录
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  console.log(`📥 开始下载 ${postLinks.length} 条微博...`);

  for (let i = 0; i < postLinks.length; i++) {
    const link = postLinks[i];
    console.log(`📥 下载第 ${i + 1}/${postLinks.length} 条: ${link}`);

    try {
      // 访问微博页面
      await testSystem.state.page.goto(link, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      await testSystem.state.page.waitForTimeout(3000);

      // 滚动几次加载更多内容
      for (let j = 0; j < 3; j++) {
        await testSystem.state.page.keyboard.press('PageDown');
        await testSystem.state.page.waitForTimeout(2000);
      }

      // 提取微博内容
      const postData = await testSystem.state.page.evaluate(() => {
        try {
          // 先检查是否是个人主页
          if (window.location.href.includes('/u/') || window.location.href.includes('/p/')) {
            return {
              url: window.location.href,
              author: '个人主页/话题页',
              content: '跳过个人主页和话题页',
              commentCount: '0',
              shareCount: '0',
              likeCount: '0',
              publishTime: '未知时间',
              extractedAt: new Date().toISOString(),
              skipped: true
            };
          }

          // 更广泛的选择器来查找微博内容
          // 提取作者
          const authorSelectors = [
            '.Feed_body__LQkWm .Feed_body__3H0lj a',
            '[data-feedid] .woo-box-flex.woo-box-alignCenter.Card_title__y_uGq a',
            '.woo-box-flex.woo-box-alignCenter.Card_title__y_uGq a',
            '.Feed_body__3H0lj .Feed_body__1d3F_ a',
            '.card-title a',
            '.author a'
          ];

          let author = '未知作者';
          for (const selector of authorSelectors) {
            const authorElement = document.querySelector(selector);
            if (authorElement && authorElement.textContent.trim()) {
              author = authorElement.textContent.trim();
              break;
            }
          }

          // 提取正文 - 使用更多选择器
          const contentSelectors = [
            '.Feed_body__LQkWm .Feed_body__3H0lj .Feed_body__2Nl0b',
            '[data-feedid] .Feed_body__3H0lj .Feed_body__2Nl0b',
            '.Feed_body__2Nl0b',
            '.woo-box-flex.woo-box-alignCenter.Card_title__y_uGq + .Feed_body__3H0lj',
            '.card-content',
            '.post-content',
            '.content'
          ];

          let content = '';
          for (const selector of contentSelectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
              const text = element.textContent.trim();
              if (text && !text.includes('展开') && !text.includes('收起') && text.length > 10) {
                content += text + '\n';
              }
            });
          }

          // 如果还是没找到内容，尝试获取页面主要文本
          if (!content) {
            const mainText = document.querySelector('main') || document.querySelector('.main') || document.body;
            content = mainText.textContent.trim().substring(0, 500);
          }

          // 提取互动数据
          const interactionSelectors = [
            '[data-feedid] .Feed_body__3H0lj .Feed_body__4Vkw9 .Feed_body__1d3F_',
            '.Feed_body__LQkWm .Feed_body__4Vkw9 .Feed_body__1d3F_',
            '.interaction-counts span',
            '.stats span'
          ];

          const interactions = { commentCount: '0', shareCount: '0', likeCount: '0' };
          const interactionElements = document.querySelectorAll(interactionSelectors.join(', '));

          interactionElements.forEach((element, index) => {
            const text = element.textContent.trim();
            if (index < 3) {
              if (index === 0) interactions.shareCount = text || '0';
              else if (index === 1) interactions.commentCount = text || '0';
              else if (index === 2) interactions.likeCount = text || '0';
            }
          });

          // 提取发布时间
          const timeSelectors = [
            '[data-feedid] .Feed_body__3H0lj .Feed_body__4Vkw9 .Feed_body__1d3F_:nth-child(4)',
            '.Feed_body__LQkWm .Feed_body__4Vkw9 .Feed_body__1d3F_:nth-child(4)',
            '.time',
            '.publish-time',
            '.date'
          ];

          let publishTime = '未知时间';
          for (const selector of timeSelectors) {
            const timeElement = document.querySelector(selector);
            if (timeElement && timeElement.textContent.trim()) {
              publishTime = timeElement.textContent.trim();
              break;
            }
          }

          return {
            url: window.location.href,
            author: author,
            content: content.trim() || '无法提取内容',
            commentCount: interactions.commentCount,
            shareCount: interactions.shareCount,
            likeCount: interactions.likeCount,
            publishTime: publishTime,
            extractedAt: new Date().toISOString(),
            pageSource: 'detail'
          };
        } catch (error) {
          return {
            url: window.location.href,
            author: '提取失败',
            content: '内容提取失败: ' + error.message,
            commentCount: '0',
            shareCount: '0',
            likeCount: '0',
            publishTime: '未知时间',
            extractedAt: new Date().toISOString(),
            error: error.message
          };
        }
      });

      // 保存单条微博
      const postFile = path.join(downloadDir, `post-${i + 1}-${Date.now()}.json`);
      fs.writeFileSync(postFile, JSON.stringify(postData, null, 2));

      downloadedPosts.push(postData);
      console.log(`✅ 成功下载: ${postData.author} - ${postData.content.substring(0, 50)}...`);

    } catch (error) {
      console.error(`❌ 第 ${i + 1} 条下载失败: ${error.message}`);

      // 记录失败
      const failedPost = {
        url: link,
        author: '下载失败',
        content: '下载失败',
        commentCount: '0',
        shareCount: '0',
        likeCount: '0',
        publishTime: '未知时间',
        extractedAt: new Date().toISOString(),
        error: error.message
      };

      downloadedPosts.push(failedPost);
    }

    // 随机延迟，避免被反爬
    await testSystem.state.page.waitForTimeout(Math.random() * 2000 + 1000);
  }

  return downloadedPosts;
}

// 生成合并文档
async function generateMergedDocument(downloadedPosts) {
  const timestamp = new Date().toISOString();
  const dateStr = new Date().toLocaleDateString('zh-CN');

  let documentContent = `# 微博内容汇总报告\n\n`;
  documentContent += `## 基本信息\n`;
  documentContent += `- **汇总时间**: ${dateStr}\n`;
  documentContent += `- **微博总数**: ${downloadedPosts.length}\n`;
  documentContent += `- **汇总时间戳**: ${timestamp}\n\n`;

  documentContent += `## 内容汇总\n\n`;

  // 统计信息
  const totalComments = downloadedPosts.reduce((sum, post) => {
    const count = parseInt(post.commentCount.replace(/[^\d]/g, '')) || 0;
    return sum + count;
  }, 0);

  const totalShares = downloadedPosts.reduce((sum, post) => {
    const count = parseInt(post.shareCount.replace(/[^\d]/g, '')) || 0;
    return sum + count;
  }, 0);

  const totalLikes = downloadedPosts.reduce((sum, post) => {
    const count = parseInt(post.likeCount.replace(/[^\d]/g, '')) || 0;
    return sum + count;
  }, 0);

  documentContent += `### 互动数据统计\n`;
  documentContent += `- **总评论数**: ${totalComments}\n`;
  documentContent += `- **总转发数**: ${totalShares}\n`;
  documentContent += `- **总点赞数**: ${totalLikes}\n`;
  documentContent += `- **平均评论数**: ${(totalComments / downloadedPosts.length).toFixed(1)}\n`;
  documentContent += `- **平均转发数**: ${(totalShares / downloadedPosts.length).toFixed(1)}\n`;
  documentContent += `- **平均点赞数**: ${(totalLikes / downloadedPosts.length).toFixed(1)}\n\n`;

  documentContent += `## 详细内容\n\n`;

  downloadedPosts.forEach((post, index) => {
    documentContent += `### ${index + 1}. ${post.author}\n`;
    documentContent += `**链接**: ${post.url}\n`;
    documentContent += `**发布时间**: ${post.publishTime}\n`;
    documentContent += `**互动**: 💬 ${post.commentCount} | 🔄 ${post.shareCount} | ❤️ ${post.likeCount}\n\n`;
    documentContent += `**内容**:\n${post.content}\n\n`;
    documentContent += `---\n\n`;
  });

  // 保存文档
  const documentFile = `${TEST_CONFIG.paths.outputDir}/weibo-summary-${Date.now()}.md`;
  fs.writeFileSync(documentFile, documentContent);

  // 同时保存JSON格式
  const jsonFile = `${TEST_CONFIG.paths.outputDir}/weibo-summary-${Date.now()}.json`;
  fs.writeFileSync(jsonFile, JSON.stringify({
    timestamp,
    dateStr,
    totalPosts: downloadedPosts.length,
    totalComments,
    totalShares,
    totalLikes,
    averageComments: totalComments / downloadedPosts.length,
    averageShares: totalShares / downloadedPosts.length,
    averageLikes: totalLikes / downloadedPosts.length,
    posts: downloadedPosts
  }, null, 2));

  console.log(`📄 文档已保存: ${documentFile}`);
  console.log(`📄 数据已保存: ${jsonFile}`);

  return documentFile;
}

// 如果直接运行此脚本
if (require.main === module) {
  weiboBatchDownloadWorkflow()
    .then(results => {
      console.log('\n🎊 微博批量下载工作流完成！');
      console.log(`📄 合并文档: ${results.documentPath}`);
      console.log(`📊 下载成功率: ${results.successRate.toFixed(1)}%`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 工作流执行失败:', error.message);
      process.exit(1);
    });
}

module.exports = weiboBatchDownloadWorkflow;