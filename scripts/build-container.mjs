#!/usr/bin/env node
/**
 * 交互式容器构建工具（CLI 入口）
 * 使用 AI 辅助分析 DOM 并生成容器定义
 */

import { InteractiveDOMBuilder } from '../modules/workflow-builder/src/dom-analyzer/InteractiveDOMBuilder.js';

async function main() {
  const args = process.argv.slice(2);
  
  const profile = args[0] || 'weibo_fresh';
  const url = args[1] || 'https://weibo.com';
  
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         交互式 DOM 容器构建器（AI 辅助）                  ║
╚════════════════════════════════════════════════════════════╝

使用方法:
  node scripts/build-container.mjs [profile] [url]

示例:
  node scripts/build-container.mjs weibo_fresh https://weibo.com

前置条件:
  1. 启动服务: node scripts/start-headful.mjs
  2. 启动 AI 服务: 本地 http://127.0.0.1:5555 (无需 API Key)

开始构建...
`);

  const builder = new InteractiveDOMBuilder({
    provider: {
      baseUrl: 'http://127.0.0.1:5555',
      model: 'gpt-4'
    },
    profile,
    url,
    interactive: true
  });

  await builder.build();
}

main().catch((error) => {
  console.error('❌ 构建失败:', error);
  process.exit(1);
});
