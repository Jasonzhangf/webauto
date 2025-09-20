/**
 * 单个微博帖子捕获使用示例
 * 演示如何使用节点驱动系统捕获单个微博帖子的内容
 */

const { WorkflowEngine } = require('../engine/workflow-engine');
const path = require('path');

async function captureSinglePostExample() {
  console.log('🚀 开始单个微博帖子捕获示例...\n');

  // 1. 创建工作流引擎
  const workflowEngine = new WorkflowEngine({
    configPath: path.join(__dirname, '../configs/single-post-capture-workflow.json'),
    logLevel: 'info',
    enableDebug: true
  });

  // 2. 设置输入数据
  const inputData = {
    postUrl: 'https://weibo.com/1234567890/AbCdEfGhIj', // 替换为实际的微博帖子URL
    options: {
      enableMediaDownload: true,
      enableCommentExtraction: true,
      maxComments: 500,
      quality: 'high'
    }
  };

  try {
    // 3. 初始化工作流引擎
    console.log('📋 初始化工作流引擎...');
    await workflowEngine.initialize();

    // 4. 执行捕获工作流
    console.log('🎯 执行帖子捕获工作流...');
    console.log(`目标URL: ${inputData.postUrl}\n`);

    const result = await workflowEngine.execute(inputData);

    // 5. 处理结果
    if (result.success) {
      console.log('✅ 帖子捕获成功完成！\n');

      // 显示捕获统计
      if (result.metadata && result.metadata.integrationStats) {
        const stats = result.metadata.integrationStats;
        console.log('📊 捕获统计:');
        console.log(`   执行时间: ${stats.executionTime}ms`);
        console.log(`   处理数据项: ${stats.totalProcessed}`);
        console.log(`   生成关系映射: ${stats.relationsGenerated}`);
        if (stats.duplicatesRemoved > 0) {
          console.log(`   移除重复媒体: ${stats.duplicatesRemoved}`);
        }
        console.log('');
      }

      // 显示数据摘要
      if (result.metadata && result.metadata.summary) {
        const summary = result.metadata.summary;
        console.log('📋 数据摘要:');
        console.log(`   帖子ID: ${summary.postId}`);
        console.log(`   评论总数: ${summary.overview.totalComments}`);
        console.log(`   媒体文件: ${summary.overview.totalMedia}`);
        console.log(`   包含图片: ${summary.overview.hasImages ? '是' : '否'}`);
        console.log(`   包含视频: ${summary.overview.hasVideos ? '是' : '否'}`);
        console.log('');
      }

      // 显示保存的文件
      if (result.savedFiles && result.savedFiles.length > 0) {
        console.log('💾 保存的文件:');
        result.savedFiles.forEach((file, index) => {
          console.log(`   ${index + 1}. ${file.filename} (${file.format}, ${file.size} bytes)`);
        });
        console.log('');
      }

      // 显示导出路径
      if (result.exportPaths) {
        console.log('📁 导出路径:');
        console.log(`   基础目录: ${result.exportPaths.base}`);
        if (result.exportPaths.json) {
          console.log(`   JSON数据: ${result.exportPaths.json}`);
        }
        if (result.exportPaths.csv) {
          console.log(`   CSV数据: ${result.exportPaths.csv}`);
        }
        if (result.exportPaths.report) {
          console.log(`   捕获报告: ${result.exportPaths.report}`);
        }
        console.log('');
      }

      // 显示热门评论（如果有）
      if (result.metadata && result.metadata.summary && result.metadata.summary.contentHighlights) {
        const highlights = result.metadata.summary.contentHighlights;
        if (highlights.topComments && highlights.topComments.length > 0) {
          console.log('🔥 热门评论:');
          highlights.topComments.forEach((comment, index) => {
            console.log(`   ${index + 1}. @${comment.author}: ${comment.content} (${comment.likes} 赞)`);
          });
          console.log('');
        }
      }

      // 显示验证错误（如果有）
      if (result.validationInfo && result.validationInfo.hasErrors) {
        console.log('⚠️ 数据验证警告:');
        console.log(`   错误数量: ${result.validationInfo.errorCount}`);
        result.validationInfo.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error.type}: ${error.errors.join(', ')}`);
        });
        console.log('');
      }

    } else {
      console.log('❌ 帖子捕获失败！');
      console.log(`错误信息: ${result.error}`);

      if (result.errorDetails) {
        console.log('\n📋 错误详情:');
        console.log(`   节点: ${result.errorDetails.nodeId}`);
        console.log(`   错误类型: ${result.errorDetails.errorType}`);
        console.log(`   错误时间: ${result.errorDetails.timestamp}`);
      }
    }

  } catch (error) {
    console.error('💥 执行过程中发生异常:', error);
    console.error('错误堆栈:', error.stack);
  } finally {
    // 6. 清理资源
    console.log('🧹 清理工作流资源...');
    await workflowEngine.cleanup();
    console.log('🏁 示例执行完成');
  }
}

// 运行示例
if (require.main === module) {
  captureSinglePostExample().catch(console.error);
}

module.exports = { captureSinglePostExample };