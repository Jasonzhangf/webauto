/**
 * 基于自刷新容器的动态评论提取完整示例
 * 演示嵌套刷新、动态发现、操作注册的完整流程
 */

import { WeiboCommentContainer } from '../src/containers/WeiboCommentContainer';

interface ExtractionResult {
  success: boolean;
  comments: any[];
  stats: any;
  executionTime: number;
  refreshHistory: any[];
}

async function dynamicCommentExtractionExample(): Promise<ExtractionResult> {
  console.log('🚀 开始基于自刷新容器的动态评论提取示例...\n');

  const startTime = Date.now();

  try {
    // 1. 创建微博评论容器
    const commentContainer = new WeiboCommentContainer({
      id: 'main-comment-container',
      name: '微博主评论容器',
      selector: '.Feed_body_comments, .Comment_container',
      refreshInterval: 2000,           // 2秒自动刷新
      enableAutoRefresh: true,        // 启用自动刷新
      enableMutationObserver: true,   // 启用内容变化监听
      maxComments: 1000,              // 最大评论数量
      maxScrollAttempts: 15,          // 最大滚动尝试次数
      scrollDelay: 1500,              // 滚动延迟
      enableAutoScroll: true,         // 启用自动滚动
      commentSelectors: [             // 评论选择器
        '.Comment_item',
        '.Feed_body_comments .Comment_item',
        '[class*="comment-item"]'
      ],
      loadMoreSelectors: [            // 加载更多按钮选择器
        '.Comment_more',
        '.Feed_body_comments_more',
        '[class*="more"]'
      ],
      childContainerTypes: ['reply']  // 子容器类型
    });

    // 2. 设置事件监听器
    setupEventListeners(commentContainer);

    // 3. 初始化容器（启动所有刷新机制）
    console.log('📋 步骤1: 初始化评论容器...');
    await commentContainer.initialize(page);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 4. 执行手动刷新以确保最新状态
    console.log('📋 步骤2: 执行手动刷新...');
    await commentContainer.refresh();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 5. 等待自动发现过程工作
    console.log('📋 步骤3: 等待自动发现过程（15秒）...');
    await waitForDiscovery(commentContainer, 15);

    // 6. 执行一些操作来触发动态加载
    console.log('📋 步骤4: 执行操作触发动态加载...');
    await performTriggerOperations(commentContainer);

    // 7. 获取最终结果
    console.log('📋 步骤5: 获取最终提取结果...');
    const result = await getFinalResults(commentContainer);

    // 8. 清理资源
    console.log('📋 步骤6: 清理资源...');
    await commentContainer.cleanup();

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      comments: result.comments,
      stats: result.stats,
      executionTime,
      refreshHistory: commentContainer['refreshHistory'] || []
    };

  } catch (error) {
    console.error('💥 动态评论提取失败:', error);
    return {
      success: false,
      comments: [],
      stats: {},
      executionTime: Date.now() - startTime,
      refreshHistory: []
    };
  }
}

/**
 * 设置事件监听器
 */
function setupEventListeners(container: WeiboCommentContainer): void {
  console.log('📡 设置事件监听器...');

  // 监听刷新完成事件
  container.on('refresh:completed', (data) => {
    const stats = container.getCommentStats();
    console.log(`✅ 刷新完成 [${data.trigger.type}] - 当前评论数: ${stats.totalComments}`);
  });

  // 监听新评论发现事件
  container.on('comments:discovered', (data) => {
    console.log(`🆕 发现新评论: ${data.comments.length} 条, 总计: ${data.totalCount} 条`);
  });

  // 监听容器内容变化事件
  container.on('container:changed', (data) => {
    console.log(`📝 容器内容变化: ${JSON.stringify(data)}`);
  });

  // 监听操作注册事件
  container.on('operation:registered', (data) => {
    console.log(`📝 操作注册: ${data.operationId}`);
  });

  // 监听子容器发现事件
  container.on('child:discovered', (data) => {
    console.log(`👶 发现子容器: ${data.container.config.name}`);
  });

  console.log('✅ 事件监听器设置完成');
}

/**
 * 等待自动发现过程
 */
async function waitForDiscovery(container: WeiboCommentContainer, seconds: number): Promise<void> {
  console.log(`⏳ 等待自动发现过程 (${seconds}秒)...`);

  let lastCommentCount = 0;
  let noChangeCount = 0;

  const checkInterval = setInterval(() => {
    const currentStats = container.getCommentStats();
    const currentCount = currentStats.totalComments;

    if (currentCount === lastCommentCount) {
      noChangeCount++;
    } else {
      noChangeCount = 0;
      console.log(`📈 评论数变化: ${lastCommentCount} → ${currentCount}`);
    }

    lastCommentCount = currentCount;

    // 如果连续3次检查都没有变化，可能已经稳定
    if (noChangeCount >= 3) {
      console.log('📊 评论数量趋于稳定');
    }
  }, 1000);

  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  clearInterval(checkInterval);

  const finalStats = container.getCommentStats();
  console.log(`⏳ 等待完成，当前评论数: ${finalStats.totalComments}`);
}

/**
 * 执行触发操作
 */
async function performTriggerOperations(container: WeiboCommentContainer): Promise<void> {
  console.log('🎮 执行触发操作...');

  try {
    // 1. 检查可用的操作
    const state = container.getState();
    console.log(`📝 可用操作: ${state.operations.join(', ') || '无'}`);

    // 2. 尝试执行加载更多操作（如果存在）
    if (state.operations.includes('button_0')) {
      console.log('🎮 执行加载更多操作...');
      const result = await container.executeOperation('button_0');
      console.log(`🎮 操作结果: ${result.success ? '成功' : '失败'}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 3. 执行滚动操作
    console.log('🎮 执行滚动操作...');
    await container.executeOperation('scroll_to_load');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. 重置滚动计数以继续自动滚动
    container.resetScrollAttempts();
    console.log('📜 重置滚动计数，继续自动滚动');

    // 5. 等待自动刷新工作
    console.log('⏳ 等待自动刷新工作（5秒）...');
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    console.warn('触发操作执行失败:', error);
  }
}

/**
 * 获取最终结果
 */
async function getFinalResults(container: WeiboCommentContainer): Promise<{
  comments: any[];
  stats: any;
}> {
  console.log('📊 获取最终提取结果...');

  // 获取所有评论
  const comments = container.getAllComments();
  console.log(`💬 提取评论总数: ${comments.length}`);

  // 获取统计信息
  const stats = container.getCommentStats();
  console.log('📊 评论统计信息:');
  console.log(`   - 总评论数: ${stats.totalComments}`);
  console.log(`   - 独立作者: ${stats.uniqueAuthors}`);
  console.log(`   - 总点赞数: ${stats.totalLikes}`);
  console.log(`   - 总回复数: ${stats.totalReplies}`);
  console.log(`   - 有回复的评论: ${stats.commentsWithReplies}`);
  console.log(`   - 平均点赞数: ${stats.averageLikes.toFixed(1)}`);

  // 获取刷新统计
  const refreshStats = stats.refreshStats;
  console.log('📊 刷新统计信息:');
  console.log(`   - 总刷新次数: ${refreshStats.totalRefreshes}`);
  console.log(`   - 触发源分布: ${JSON.stringify(refreshStats.triggerCounts)}`);
  console.log(`   - 平均刷新间隔: ${refreshStats.averageInterval.toFixed(0)}ms`);
  console.log(`   - 最后刷新时间: ${new Date(refreshStats.lastRefreshTime).toLocaleTimeString()}`);

  // 显示部分评论内容
  if (comments.length > 0) {
    console.log('\n📝 部分评论内容预览:');
    comments.slice(0, 3).forEach((comment, index) => {
      const preview = comment.content.length > 50
        ? comment.content.substring(0, 50) + '...'
        : comment.content;
      console.log(`   ${index + 1}. @${comment.author.name}: ${preview} (${comment.statistics.likes} 赞)`);
    });
    if (comments.length > 3) {
      console.log(`   ... 还有 ${comments.length - 3} 条评论`);
    }
  }

  return {
    comments,
    stats: {
      commentStats: stats,
      refreshStats: refreshStats
    }
  };
}

/**
 * 显示执行摘要
 */
function displayExecutionSummary(result: ExtractionResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 动态评论提取执行摘要');
  console.log('='.repeat(60));

  if (result.success) {
    console.log('✅ 执行状态: 成功');
    console.log(`⏱️ 执行时间: ${(result.executionTime / 1000).toFixed(1)}秒`);
    console.log(`💬 提取评论数: ${result.comments.length}`);
    console.log(`📊 总刷新次数: ${result.refreshHistory.length}`);

    // 触发源统计
    const triggerCounts = result.refreshHistory.reduce((acc, trigger) => {
      acc[trigger.type] = (acc[trigger.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('🔄 刷新触发源分布:');
    Object.entries(triggerCounts).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count} 次`);
    });

    // 评论质量统计
    const stats = result.stats.commentStats;
    if (stats) {
      console.log('📈 评论质量统计:');
      console.log(`   - 独立作者: ${stats.uniqueAuthors}`);
      console.log(`   - 平均点赞数: ${stats.averageLikes.toFixed(1)}`);
      console.log(`   - 有回复的评论: ${stats.commentsWithReplies} (${((stats.commentsWithReplies / stats.totalComments) * 100).toFixed(1)}%)`);
    }

  } else {
    console.log('❌ 执行状态: 失败');
    console.log(`⏱️ 执行时间: ${(result.executionTime / 1000).toFixed(1)}秒`);
  }

  console.log('='.repeat(60));
}

// 导出使用函数
export { dynamicCommentExtractionExample, displayExecutionSummary };

// 如果作为主程序运行
async function main() {
  console.log('🚀 启动动态评论提取示例...\n');

  // 注意：这里需要传入实际的 page 对象
  // const page = await browser.newPage();
  // await page.goto('https://weibo.com/1234567890/AbCdEfGhIj');

  // 模拟 page 对象（实际使用时需要替换）
  const page = null;

  if (!page) {
    console.log('❌ 需要传入有效的 page 对象');
    return;
  }

  const result = await dynamicCommentExtractionExample();
  displayExecutionSummary(result);
}

if (require.main === module) {
  main().catch(console.error);
}