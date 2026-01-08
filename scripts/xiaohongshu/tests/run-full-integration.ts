#!/usr/bin/env node
/**
 * 小红书完整采集链路集成测试 (P2.3)
 * 
 * 流程：
 * 1. Phase 1: 登录 & 会话检查
 * 2. Phase 2: 搜索关键词 & 获取结果列表
 * 3. Phase 3-8 (Loop): 
 *    - 打开详情 (OpenDetail)
 *    - 提取内容 (ExtractDetail)
 *    - 评论采集 (Comments)
 *    - 数据持久化 (PersistXhsNoteBlock - P2.2)
 *    - 关闭详情 (CloseDetail)
 *    - 错误恢复 (ESC Recovery - P1.2)
 */

import minimist from 'minimist';
import { execute as ensureSession } from '../../../modules/workflow/blocks/EnsureSession.ts';
import { execute as ensureLogin } from '../../../modules/workflow/blocks/EnsureLoginBlock.ts';
import { execute as waitSearchPermit } from '../../../modules/workflow/blocks/WaitSearchPermitBlock.ts';
import { execute as goToSearch } from '../../../modules/workflow/blocks/GoToSearchBlock.ts';
import { execute as collectSearchList } from '../../../modules/workflow/blocks/CollectSearchListBlock.ts';
import { execute as openDetail } from '../../../modules/workflow/blocks/OpenDetailBlock.ts';
import { execute as extractDetail } from '../../../modules/workflow/blocks/ExtractDetailBlock.ts';
import { execute as warmupComments } from '../../../modules/workflow/blocks/WarmupCommentsBlock.ts';
import { execute as expandComments } from '../../../modules/workflow/blocks/ExpandCommentsBlock.ts';
import { execute as collectComments } from '../../../modules/workflow/blocks/CollectCommentsBlock.ts';
import { execute as persistNote } from '../../../modules/workflow/blocks/PersistXhsNoteBlock.ts';
import { execute as closeDetail } from '../../../modules/workflow/blocks/CloseDetailBlock.ts';
import { execute as errorRecovery } from '../../../modules/workflow/blocks/ErrorRecoveryBlock.ts';

const SESSION_ID = 'xiaohongshu_fresh';

async function main() {
  const args = minimist(process.argv.slice(2));
  const keyword = args.keyword || '手机膜';
  const targetCount = Number(args.count || 5);
  
  console.log(`🚀 开始小红书采集任务: 关键词="${keyword}", 目标=${targetCount}条`);

  try {
    // === Phase 1: 准备工作 ===
    console.log('\n[Phase 1] 正在检查会话与登录状态...');
    await ensureSession({ profileId: SESSION_ID, url: 'https://www.xiaohongshu.com' });
    const loginResult = await ensureLogin({ sessionId: SESSION_ID });
    if (!loginResult.loggedIn) {
      throw new Error('未登录，请先手动登录或运行 Phase1 脚本');
    }

    // === Phase 2: 搜索与列表 ===
    console.log('\n[Phase 2] 执行搜索...');
    await waitSearchPermit({ sessionId: SESSION_ID });
    const searchResult = await goToSearch({ sessionId: SESSION_ID, keyword });
    if (!searchResult.success) throw new Error(`搜索失败: ${searchResult.error}`);

    console.log('正在获取搜索结果列表...');
    const listResult = await collectSearchList({ sessionId: SESSION_ID, targetCount });
    if (!listResult.success || !listResult.items?.length) {
      throw new Error(`获取列表失败: ${listResult.error}`);
    }
    
    console.log(`✅ 获取到 ${listResult.items.length} 条笔记，准备开始采集...`);

    // === Phase 3+: 循环采集 ===
    let successCount = 0;
    
    for (let i = 0; i < listResult.items.length; i++) {
      if (successCount >= targetCount) break;
      
      const item = listResult.items[i];
      console.log(`\n📄 [${i + 1}/${listResult.items.length}] 处理笔记: ${item.title} (${item.noteId})`);
      
      try {
        await processNote(item, keyword);
        successCount++;
        console.log(`✅ 笔记采集成功`);
      } catch (err: any) {
        console.error(`❌ 笔记采集失败: ${err.message}`);
        
        // P1.2 错误恢复机制
        console.log('🔄 触发 ESC 错误恢复...');
        const recovered = await errorRecovery({
          sessionId: SESSION_ID,
          fromStage: 'detail',
          targetStage: 'search',
          recoveryMode: 'esc'
        });
        
        if (!recovered.success) {
          console.error('❌ 严重错误: 无法恢复到搜索页，任务终止');
          process.exit(1);
        }
        console.log('✅ 状态已恢复，继续下一条...');
      }
    }
    
    console.log(`\n🎉 任务完成! 成功采集: ${successCount}/${targetCount}`);
    
  } catch (err: any) {
    console.error('\n❌ 任务异常终止:', err.message);
    process.exit(1);
  }
}

async function processNote(item: any, keyword: string) {
  // 1. 打开详情
  const openRes = await openDetail({ 
    sessionId: SESSION_ID, 
    containerId: item.containerId 
  });
  if (!openRes.success) throw new Error(`打开详情失败: ${openRes.error}`);

  // 2. 提取详情
  const detailRes = await extractDetail({ sessionId: SESSION_ID });
  if (!detailRes.success) throw new Error(`提取详情失败: ${detailRes.error}`);

  // 3. 评论处理
  await warmupComments({ sessionId: SESSION_ID });
  await expandComments({ sessionId: SESSION_ID });
  const commentsRes = await collectComments({ sessionId: SESSION_ID });

  // 4. 持久化 (P2.2)
  const persistRes = await persistNote({
    sessionId: SESSION_ID,
    env: 'prod',
    keyword,
    noteId: item.noteId,
    detailUrl: item.detailUrl,
    detail: detailRes.detail,
    commentsResult: commentsRes
  });
  
  if (persistRes.success) {
    console.log(`   💾 已保存到: ${persistRes.contentPath}`);
  } else {
    console.warn(`   ⚠️ 保存失败: ${persistRes.error}`);
  }

  // 5. 关闭详情
  const closeRes = await closeDetail({ sessionId: SESSION_ID });
  if (!closeRes.success) throw new Error(`关闭详情失败: ${closeRes.error}`);
}

main().catch(console.error);
