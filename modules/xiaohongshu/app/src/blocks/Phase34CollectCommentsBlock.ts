/**
 * Phase 3-4 Block: 采集评论
 *
 * 职责：
 * 1. 展开评论区（容器驱动点击）
 * 2. 批量采集评论（每批 50 条）
 * 3. 滚动加载更多
 * 4. 返回去重后的评论数组
 */

export interface CollectCommentsInput {
  sessionId?: string;
  unifiedApiUrl?: string;
  maxRounds?: number;
  batchSize?: number;
}

export interface CollectCommentsOutput {
  success: boolean;
  comments: Array<{
    userName: string;
    userId: string;
    content: string;
    time: string;
    likeCount: number;
  }>;
  totalCollected: number;
  error?: string;
}

async function controllerAction(action: string, payload: any, apiUrl: string) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function execute(input: CollectCommentsInput): Promise<CollectCommentsOutput> {
  const {
    sessionId = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
    maxRounds = 20,
    batchSize = 50,
  } = input;

  console.log(`[Phase34CollectComments] 开始采集评论 (batchSize=${batchSize})`);

  const allComments: CollectCommentsOutput['comments'] = [];
  const seen = new Set<string>();
  let round = 0;
  let lastCount = 0;

  // 1. 展开评论区
  const expandResult = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.comment_trigger',
    operationId: 'click',
    sessionId,
  }, unifiedApiUrl);

  if (expandResult?.success === false) {
    console.warn(`[Phase34CollectComments] 评论展开失败或无评论`);
  }

  await delay(1500);

  // 2. 循环采集评论
  let noNewCount = 0; // 连续无新增计数器
  const MAX_NO_NEW = 3; // 连续 3 轮无新增才停止

  while (round < maxRounds) {
    round++;

    // 2.1 获取当前评论列表
    const extractResult = await controllerAction('container:operation', {
      containerId: 'xiaohongshu_detail.comment_list',
      operationId: 'extract',
      sessionId,
    }, unifiedApiUrl);

    if (!extractResult?.success || !extractResult?.items) {
      console.warn(`[Phase34CollectComments] 评论提取失败 round=${round}`);
      break;
    }

    const items = extractResult.items || [];

    // 2.2 去重并添加
    const prevCount = allComments.length;
    for (const item of items) {
      const key = `${item.userId || ''}:${item.content || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      allComments.push({
        userName: item.userName || '',
        userId: item.userId || '',
        content: item.content || '',
        time: item.time || '',
        likeCount: item.likeCount || 0,
      });
    }

    const newCount = allComments.length - prevCount;
    console.log(`[Phase34CollectComments] Round ${round}: 新增 ${newCount} 条，总计 ${allComments.length}`);

    // 2.3 如果有新增，重置无新增计数器
    if (newCount > 0) {
      noNewCount = 0;
    } else {
      noNewCount++;
      console.log(`[Phase34CollectComments] 无新评论计数: ${noNewCount}/${MAX_NO_NEW}`);
    }

    // 2.4 检查是否达到批次大小
    if (allComments.length >= batchSize) {
      console.log(`[Phase34CollectComments] 已达到批次大小 ${batchSize}，停止采集`);
      break;
    }

    // 2.5 连续无新增检测
    if (noNewCount >= MAX_NO_NEW) {
      console.log(`[Phase34CollectComments] 连续 ${MAX_NO_NEW} 轮无新评论，停止采集`);
      break;
    }

    // 2.6 滚动加载更多
    const scrollResult = await controllerAction('container:operation', {
      containerId: 'xiaohongshu_detail.comment_list',
      operationId: 'scroll',
      sessionId,
      config: { direction: 'down', amount: 800 },
    }, unifiedApiUrl);

    if (scrollResult?.success === false) {
      console.log(`[Phase34CollectComments] 滚动失败，可能已到底部`);
      break;
    }

    await delay(1500);
  }

  console.log(`[Phase34CollectComments] 完成，共采集 ${allComments.length} 条评论`);

  return {
    success: true,
    comments: allComments,
    totalCollected: allComments.length,
  };
}
