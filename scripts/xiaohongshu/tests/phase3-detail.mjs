#!/usr/bin/env node
/**
 * Phase 3: 详情页正文/图片提取（容器驱动版）
 */

import { execute as collectSearchList } from '../../../modules/workflow/blocks/CollectSearchListBlock.js';
import { execute as openDetail } from '../../../modules/workflow/blocks/OpenDetailBlock.js';
import { execute as extractDetail } from '../../../modules/workflow/blocks/ExtractDetailBlock.js';

const PROFILE = 'xiaohongshu_fresh';

async function main() {
  console.log('📄 Phase 3: 详情页提取测试（容器驱动版）\n');

  try {
    // 1. 先从搜索页获取一条结果
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

    // 3. 提取详情内容
    console.log('3️⃣ 提取详情内容...');
    const detailResult = await extractDetail({
      sessionId: PROFILE
    });

    if (!detailResult.success) {
      console.error(`❌ 提取失败: ${detailResult.error}`);
      process.exit(1);
    }

    const detail = detailResult.detail || {};
    console.log('   ✅ 提取成功:');
    console.log(`      - 作者: ${detail.header?.author_name || '未知'}`);
    console.log(`      - 标题: ${detail.content?.title || '无标题'}`);
    console.log(`      - 正文长度: ${(detail.content?.text || '').length}`);
    console.log(`      - 图片数: ${(detail.gallery?.images || []).length}`);

    console.log('\n✅ Phase 3 完成');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
