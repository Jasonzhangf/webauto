#!/usr/bin/env node
/**
 * Step 6 Final: 使用完整的 Workflow 采集微博帖子
 */

import { WorkflowExecutor } from '../modules/workflow-builder/src/WorkflowExecutor.ts';
import fs from 'fs/promises';

const TARGET_COUNT = 150;
const OUTPUT_FILE = 'weibo_posts_final.md';

async function main() {
  console.log('🚀 Starting Weibo Collection (Final Workflow)');
  console.log('=============================================\n');

  try {
    const workflow = new WorkflowExecutor();

    // 执行采集
    const results = await workflow.executeEventDrivenWorkflow({
      profile: 'weibo_fresh',
      url: 'https://weibo.com',
      targetCount: TARGET_COUNT,
      scrollLimit: 120,
      
      // 滚动策略配置
      autoScrollTrigger: 'on-boundary',
      boundaryThreshold: 0.8,
      scrollDistance: 800,
      waitAfterScroll: 3000
    });

    console.log('\n✅ Collection completed!');
    console.log(`📊 Total posts extracted: ${results.posts.length}`);
    console.log(`🔗 Unique links: ${results.dedupedLinks.length}`);

    // 生成 Markdown
    await generateMarkdown(results.posts, OUTPUT_FILE);

  } catch (error) {
    console.error('❌ Collection failed:', error);
    process.exit(1);
  }
}

async function generateMarkdown(posts, filename) {
  const lines = [
    '# 微博主页采集结果 (Final)',
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
    
    if (post.url) {
      lines.push(`**链接：** ${post.url}`);
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  });

  await fs.writeFile(filename, lines.join('\n'), 'utf-8');
  console.log(`✅ Markdown saved to: ${filename}`);
}

main().catch(console.error);
