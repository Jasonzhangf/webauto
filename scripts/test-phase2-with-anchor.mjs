#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 测试 Phase2 Block 的锚点验证功能
 */

import { execute as goToSearch } from '../modules/workflow/blocks/GoToSearchBlock.ts';
import { execute as collectSearchList } from '../modules/workflow/blocks/CollectSearchListBlock.ts';

const PROFILE = 'xiaohongshu_fresh';
const KEYWORD = '华为';

async function main() {
  console.log('🧪 测试 Phase2 Block 锚点验证\n');
  
  try {
    // 1. 执行搜索
    console.log(`1️⃣ 执行搜索: ${KEYWORD}`);
    const searchResult = await goToSearch({
      sessionId: PROFILE,
      keyword: KEYWORD
    });
    
    console.log(`   结果: ${searchResult.success ? '✅' : '❌'}`);
    if (searchResult.anchor) {
      console.log(`   锚点: ${searchResult.anchor.containerId}`);
      console.log(`   Rect: x=${searchResult.anchor.rect?.x.toFixed(1)}, y=${searchResult.anchor.rect?.y.toFixed(1)}, w=${searchResult.anchor.rect?.width.toFixed(1)}, h=${searchResult.anchor.rect?.height.toFixed(1)}`);
    }
    
    if (!searchResult.success) {
      console.error(`   错误: ${searchResult.error}`);
      process.exit(1);
    }
    
    // 2. 收集列表
    console.log(`\n2️⃣ 收集搜索结果列表`);
    const listResult = await collectSearchList({
      sessionId: PROFILE,
      targetCount: 5
    });
    
    console.log(`   结果: ${listResult.success ? '✅' : '❌'}`);
    console.log(`   收集数量: ${listResult.count}`);
    
    if (listResult.anchor) {
      console.log(`\n   锚点验证:`);
      console.log(`   - 列表容器: ${listResult.anchor.listContainerId}`);
      console.log(`   - 列表 Rect: x=${listResult.anchor.listRect?.x.toFixed(1)}, y=${listResult.anchor.listRect?.y.toFixed(1)}, w=${listResult.anchor.listRect?.width.toFixed(1)}, h=${listResult.anchor.listRect?.height.toFixed(1)}`);
      
      if (listResult.anchor.firstItemContainerId) {
        console.log(`   - 第一项容器: ${listResult.anchor.firstItemContainerId}`);
        console.log(`   - 第一项 Rect: x=${listResult.anchor.firstItemRect?.x.toFixed(1)}, y=${listResult.anchor.firstItemRect?.y.toFixed(1)}, w=${listResult.anchor.firstItemRect?.width.toFixed(1)}, h=${listResult.anchor.firstItemRect?.height.toFixed(1)}`);
      }
      
      console.log(`   - 验证状态: ${listResult.anchor.verified ? '✅ 通过' : '❌ 失败'}`);
    }
    
    if (!listResult.success) {
      console.error(`   错误: ${listResult.error}`);
      process.exit(1);
    }
    
    console.log('\n✅ 测试完成');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
