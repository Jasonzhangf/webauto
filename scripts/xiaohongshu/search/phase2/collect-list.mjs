/**
 * Phase2: 列表采集
 */
import { execute as collectSearchList } from '../../../../dist/modules/workflow/blocks/CollectSearchListBlock.js';
import { execute as goToSearch } from '../../../../dist/modules/workflow/blocks/GoToSearchBlock.js';
import { scroll, delay } from '../lib/browser-helper.mjs';

const PROFILE = 'xiaohongshu_fresh';

export async function collectList(keyword, targetCount, logger) {
  logger.info(`Starting list collection for "${keyword}", target=${targetCount}`);
  
  // 1. 搜索
  const searchRes = await goToSearch({
    sessionId: PROFILE,
    keyword
  });
  
  if (!searchRes.success) {
    throw new Error(`Search failed: ${searchRes.error}`);
  }
  
  let collected = [];
  let round = 0;
  
  while (collected.length < targetCount && round < 50) {
    round++;
    logger.info(`List collection round ${round}, current=${collected.length}`);
    
    // 2. 采集当前视口
    const listRes = await collectSearchList({
      sessionId: PROFILE,
      targetCount: targetCount - collected.length,
      maxScrollRounds: 1
    });
    
    if (listRes.success && listRes.items) {
      const newItems = listRes.items.filter(
        item => !collected.find(c => c.noteId === item.noteId)
      );
      if (newItems.length > 0) {
        collected.push(...newItems);
        logger.info(`Found ${newItems.length} new items`);
      } else {
        logger.warn('No new items in this round');
      }
    }
    
    // 3. 滚动
    if (collected.length < targetCount) {
      await scroll(800);
      await delay(2000);
    }
  }
  
  return collected;
}
