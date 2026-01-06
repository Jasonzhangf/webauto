#!/usr/bin/env node
/**
 * Phase 2: 小红书搜索验证（容器驱动版）
 * 目标：验证搜索输入 + 列表容器是否可用
 */

import { execute as goToSearch } from '../../../modules/workflow/blocks/GoToSearchBlock.js';
import { execute as collectSearchList } from '../../../modules/workflow/blocks/CollectSearchListBlock.js';

const PROFILE = 'xiaohongshu_fresh';
const KEYWORDS = ['手机膜', '雷军', '小米', '华为', '鸿蒙'];

async function main() {
  console.log('🔍 Phase 2: 搜索验证（容器驱动版）\n');
  
  try {
    // 1. 选择关键字
    const keyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
    console.log(`1️⃣ 选择关键字: ${keyword}`);

    // 2. 执行搜索
    console.log('\n2️⃣ 执行搜索...');
    const searchResult = await goToSearch({
      sessionId: PROFILE,
      keyword
    });

    if (!searchResult.success) {
      console.error(`❌ 搜索失败: ${searchResult.error}`);
      process.exit(1);
    }

    console.log(`   ✅ 搜索完成`);
    console.log(`      - searchPageReady: ${searchResult.searchPageReady}`);
    console.log(`      - searchExecuted: ${searchResult.searchExecuted}`);
    console.log(`      - currentUrl: ${searchResult.url}\n`);

    // 3. 收集搜索列表
    console.log('3️⃣ 收集搜索结果列表...');
    const listResult = await collectSearchList({
      sessionId: PROFILE,
      targetCount: 10
    });

    if (!listResult.success) {
      console.error(`❌ 列表收集失败: ${listResult.error}`);
      process.exit(1);
    }

    console.log(`   ✅ 收集成功: ${listResult.count} 条`);
    console.log('   📋 示例结果:');
    listResult.items.slice(0, 3).forEach((item, idx) => {
      console.log(`      ${idx + 1}. ${item.title || '无标题'} (${item.noteId || '无ID'})`);
    });

    console.log('\n✅ Phase 2 完成');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
