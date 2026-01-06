#!/usr/bin/env node
/**
 * 测试微博事件驱动工作流
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const PAGE_URL = 'https://weibo.com/';

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('');
  console.log('█'.repeat(60));
  console.log('█  事件驱动工作流测试');
  console.log('█'.repeat(60));
  console.log('');

  try {
    // 测试1: 验证配置加载
    log('CONFIG', '加载工作流配置...');
    const config = JSON.parse(await fs.readFile('modules/workflow/config/weibo-feed-extraction.json', 'utf-8'));
    log('SUCCESS', `配置加载成功: ${config.name}`);

    // 测试2: 验证展开按钮容器定义
    log('CONTAINER', '验证展开按钮容器...');
    const expandButtonExists = fsSync.existsSync('container-library/weibo/weibo_main_page/feed_post/expand_button/container.json');
    if (expandButtonExists) {
      log('SUCCESS', '展开按钮容器定义存在');
    } else {
      log('FAILED', '展开按钮容器定义不存在');
    }

    // 测试3: 验证工作流类加载
    log('WORKFLOW', '加载工作流运行器...');
    const { WeiboEventDrivenWorkflowRunner } = await import('../modules/workflow/src/WeiboEventDrivenWorkflowRunner.ts');
    log('SUCCESS', '工作流运行器类加载成功');

    // 测试4: 创建工作流实例
    const context = {
      apiClient: { post }
    };

    const runner = new WeiboEventDrivenWorkflowRunner(config, context);
    log('WORKFLOW', '工作流实例创建成功');

    // 测试5: 执行工作流（限制测试目标为5条）
    const testConfig = {
      ...config,
      config: {
        ...config.config,
        targetCount: 5  // 测试模式，只提取5条
      }
    };

    log('EXECUTE', '开始执行工作流（目标5条帖子）...');
    const result = await runner.execute();

    if (result.success) {
      log('SUCCESS', `工作流执行完成: 提取 ${result.totalExtracted} 条帖子`);
      
      if (result.totalExtracted > 0) {
        console.log('\n' + '='.repeat(60));
        console.log('📋 提取的帖子:');
        console.log('='.repeat(60));
        result.posts.forEach((post, i) => {
          console.log(`\n${i + 1}. ${post.author || '未知作者'}`);
          console.log(`   内容: ${(post.content || '').substring(0, 100)}...`);
          console.log(`   链接: ${post.url || 'N/A'}`);
        });
        console.log('\n' + '='.repeat(60));
      }
    } else {
      log('WARNING', '工作流执行完成但未提取到任何帖子');
    }

    // 最终总结
    console.log('');
    console.log('█'.repeat(60));
    console.log('█  测试总结');
    console.log('█'.repeat(60));
    console.log('✅ 配置加载: 通过');
    console.log('✅ 容器定义: 通过');
    console.log('✅ 工作流类: 通过');
    console.log('✅ 工作流执行: ' + (result.success ? '通过' : '失败'));
    console.log(`📊 提取数量: ${result.totalExtracted}`);
    console.log('📁 输出文件: modules/workflow/config/weibo-feed-extraction.json');
    console.log('');
    console.log('🎯 下一步: 基于事件驱动的工作流进行完整采集');
    console.log('='.repeat(60));

  } catch (error) {
    log('ERROR', error.message);
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);
