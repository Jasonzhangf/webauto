#!/usr/bin/env node
/**
 * Phase 4: 评论展开测试（容器驱动版）
 */

import { execute as collectSearchList } from '../../../modules/workflow/blocks/CollectSearchListBlock.js';
import { execute as openDetail } from '../../../modules/workflow/blocks/OpenDetailBlock.js';
import { execute as expandComments } from '../../../modules/workflow/blocks/ExpandCommentsBlock.js';
import { execute as closeDetail } from '../../../modules/workflow/blocks/CloseDetailBlock.js';

const PROFILE = 'xiaohongshu_fresh';

async function main() {
  console.log('💬 Phase 4: 评论展开测试（容器驱动版）\n');

  try {
    // 1. 获取搜索结果
    console.log('1️⃣ 获取搜索结果...');
    const listResult = await collectSearchList({
      sessionId: PROFILE,
      targetCount: 1
    });

    if (!listResult.success || listResult.items.length === 0) {
      console.error('❌ 未找到搜索结果，请先运行 Phase 2');
      process.exit(1);
    }

    const item = listResult.items[0];
    console.log(`   ✅ 选中结果: ${item.title || '无标题'} (${item.noteId || '无ID'})\n`);

    // 2. 打开详情页
    console.log('2️⃣ 打开详情页...');
    const openResult = await openDetail({
      sessionId: PROFILE,
      containerId: item.containerId
    });

    if (!openResult.success || !openResult.detailReady) {
      console.error(`❌ 打开详情页失败: ${openResult.error || 'detail not ready'}`);
      process.exit(1);
    }

    console.log('   ✅ 详情页已打开\n');

    // 3. 展开评论
    console.log('3️⃣ 展开评论...');
    const commentsResult = await expandComments({
      sessionId: PROFILE,
      maxRounds: 6
    });

    if (!commentsResult.success) {
      console.error(`❌ 评论展开失败: ${commentsResult.error}`);
      process.exit(1);
    }

    console.log(`   ✅ 评论数: ${commentsResult.comments.length}`);
    console.log(`   ✅ 终止条件: ${commentsResult.reachedEnd ? 'THE END' : commentsResult.emptyState ? '空状态' : '未知'}`);
    console.log(`   ✅ 示例评论: ${commentsResult.comments[0]?.text?.substring(0, 50) || '无'}\n`);

    // 4. 关闭详情页
    console.log('4️⃣ 关闭详情页...');
    const closeResult = await closeDetail({
      sessionId: PROFILE
    });

    if (!closeResult.success) {
      console.error(`❌ 关闭详情页失败: ${closeResult.error}`);
      process.exit(1);
    }

    console.log(`   ✅ 关闭方式: ${closeResult.method}\n`);

    console.log('✅ Phase 4 完成');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
