/**
 * Phase 3-4 Block: 关闭所有打开的 Tab
 *
 * 职责：
 * 1. 接收 Tab 列表
 * 2. 循环调用 browser:close_page 关闭每个 Tab
 * 3. 返回关闭结果
 */

import { controllerAction } from '../utils/controllerAction.js';

export interface CloseTabsInput {
  sessionId: string;
  tabs?: Array<{ pageId?: number }>;
  unifiedApiUrl?: string;
}

export interface CloseTabsOutput {
  success: boolean;
  closedCount: number;
  failedCount: number;
  errors?: Array<{ pageId?: number; error: string }>;
}

export async function execute(input: CloseTabsInput): Promise<CloseTabsOutput> {
  const {
    sessionId,
    tabs = [],
    unifiedApiUrl = 'http://127.0.0.1:7701'
  } = input;

  console.log(`[Phase34CloseTabs] 关闭 ${tabs.length} 个 Tab`);

  let closedCount = 0;
  let failedCount = 0;
  const errors: Array<{ pageId?: number; error: string }> = [];

  for (const tab of tabs) {
    if (!tab?.pageId) {
      console.warn(`[Phase34CloseTabs] 跳过无效 Tab: ${JSON.stringify(tab)}`);
      continue;
    }

    try {
      await controllerAction(
        'browser:close_page',
        {
          profile: sessionId,
          pageId: tab.pageId
        },
        unifiedApiUrl
      );
      closedCount++;
      console.log(`[Phase34CloseTabs] 已关闭 Tab pageId=${tab.pageId}`);
    } catch (err) {
      failedCount++;
      const errorMsg = err?.message || String(err);
      errors.push({ pageId: tab.pageId, error: errorMsg });
      console.warn(`[Phase34CloseTabs] 关闭失败 pageId=${tab.pageId}: ${errorMsg}`);
    }
  }

  console.log(`[Phase34CloseTabs] 完成: 成功 ${closedCount}, 失败 ${failedCount}`);

  return {
    success: failedCount === 0,
    closedCount,
    failedCount,
    errors: errors.length > 0 ? errors : undefined
  };
}
