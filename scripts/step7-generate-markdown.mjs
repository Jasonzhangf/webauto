#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Step 7: 生成 Markdown 报告
 */

import fs from 'fs/promises';
import path from 'path';

async function generateMarkdown(posts, filename = 'weibo_posts_150.md') {
  console.log('📝 Step 7: Generating Markdown Report');
  console.log('========================================\n');

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
    
    if (post.url) {
      lines.push(`**链接：** [${post.url}](${post.url})`);
      lines.push('');
    }
    
    if (post.timestamp) {
      lines.push(`**时间：** ${post.timestamp}`);
      lines.push('');
    }
    
    if (post.authorUrl) {
      lines.push(`**作者链接：** [${post.authorUrl}](${post.authorUrl})`);
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  });

  const content = lines.join('\n');
  await fs.writeFile(filename, content, 'utf-8');
  
  console.log(`✅ Markdown saved to: ${filename}`);
  console.log(`📊 Total posts: ${posts.length}`);
}

// 示例数据
const examplePosts = [
  {
    url: 'https://weibo.com/1260797924/QlpFUptH7',
    author: '示例作者',
    content: '这是示例微博内容，用于测试 Markdown 生成功能。这个帖子包含一些文本内容，可以用来验证生成的格式是否正确。',
    timestamp: '2024-01-04 15:30',
    authorUrl: 'https://weibo.com/u/1260797924'
  },
  {
    url: 'https://weibo.com/1260797925/QlpFUptH8',
    author: '另一个作者',
    content: '另一个示例帖子的内容。这个帖子可能包含更多文字内容，用于测试长文本的截取功能。',
    timestamp: '2024-01-04 14:45',
    authorUrl: 'https://weibo.com/u/1260797925'
  }
];

async function main() {
  await generateMarkdown(examplePosts);
  console.log('\n✅ Step 7 Complete!');
}

main().catch(console.error);
