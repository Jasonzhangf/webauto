#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 微博主页帖子采集脚本
 * 
 * 功能：
 * 1. 使用事件驱动的 Workflow 采集微博主页帖子
 * 2. 自动滚动加载更多内容
 * 3. 自动点击"展开"按钮
 * 4. 提取帖子数据并去重
 * 5. 输出为 Markdown 格式
 */

import { WorkflowExecutor } from '../modules/workflow-builder/dist/WorkflowExecutor.js';
import fs from 'fs/promises';
import path from 'path';

const TARGET_COUNT = 150;
const OUTPUT_FILE = 'weibo_posts_150.md';

async function main() {
  console.log('🚀 Starting Weibo Posts Collection...');
  console.log(`📊 Target: ${TARGET_COUNT} posts`);
  console.log(`📁 Output: ${OUTPUT_FILE}`);
  console.log('');

  // 创建 Workflow 执行器
  const workflow = new WorkflowExecutor();

  // 监听进度事件
  workflow.emitter.subscribe((event) => {
    if (event.type === 'workflow:log') {
      const log = event.payload;
      if (log.level === 'info') {
        console.log(`ℹ️  ${log.message}`);
      } else if (log.level === 'warn') {
        console.warn(`⚠️  ${log.message}`);
      } else if (log.level === 'error') {
        console.error(`❌ ${log.message}`);
      }
    }
  });

  try {
    // 执行采集
    const results = await workflow.executeEventDrivenWorkflow({
      profile: 'weibo_fresh',
      url: 'https://weibo.com',
      targetCount: TARGET_COUNT,
      scrollLimit: 100,
      
      // 滚动策略配置
      autoScrollTrigger: 'immediate',  // 立即开始滚动
      boundaryThreshold: 0.8,
      scrollDistance: 800,
      waitAfterScroll: 3000,
    });

    console.log('');
    console.log('✅ Collection completed!');
    console.log(`📊 Total posts extracted: ${results.posts.length}`);
    console.log(`🔗 Unique links: ${results.dedupedLinks.length}`);

    // 生成 Markdown
    await generateMarkdown(results.posts, OUTPUT_FILE);

    console.log(`📁 Markdown saved to: ${OUTPUT_FILE}`);
    console.log('');
    console.log('🎉 Done!');

  } catch (error) {
    console.error('❌ Collection failed:', error);
    process.exit(1);
  }
}

/**
 * 生成 Markdown 输出
 */
async function generateMarkdown(posts, outputFile) {
  const lines = [
    '# 微博主页采集结果',
    '',
    `采集时间：${new Date().toLocaleString('zh-CN')}`,
    `帖子数量：${posts.length}`,
    '',
    '---',
    ''
  ];

  posts.forEach((post, index) => {
    lines.push(`## ${index + 1}. ${post.author || '未知作者'}`);
    lines.push('');
    
    if (post.content) {
      lines.push(`**内容：** ${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}`);
      lines.push('');
    }
    
    if (post.links && post.links.length > 0) {
      lines.push(`**链接：** ${post.links[0].href}`);
      lines.push('');
    }
    
    if (post.timestamp) {
      lines.push(`**时间：** ${post.timestamp}`);
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  });

  await fs.writeFile(outputFile, lines.join('\n'), 'utf-8');
}

main().catch(console.error);
