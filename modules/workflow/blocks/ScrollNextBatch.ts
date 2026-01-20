/**
 * Workflow Block: ScrollNextBatch
 *
 * 执行一次滚动并等待稳定
 */

export interface ScrollNextBatchInput {
  sessionId: string;
  distance?: number;
  serviceUrl?: string;
}

export interface ScrollNextBatchOutput {
  scrolled: boolean;
  previousPosition: number;
  newPosition: number;
  error?: string;
}

/**
 * 执行下一批滚动
 *
 * @param input - 输入参数
 * @returns Promise<ScrollNextBatchOutput>
 */
export async function execute(input: ScrollNextBatchInput): Promise<ScrollNextBatchOutput> {
  const { sessionId, distance = 800, serviceUrl = 'http://127.0.0.1:7704' } = input;

  const commandUrl = `${serviceUrl}/command`;

  try {
    const beforeRes = await fetch(commandUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate',
        args: {
          profileId: sessionId,
          script: 'window.scrollY || 0',
        },
      }),
    });
    const beforeData = await beforeRes.json().catch(() => ({} as any));
    const previousPosition = Number(beforeData?.data?.result ?? beforeData?.body?.result ?? beforeData?.result ?? 0) || 0;

    const wheelRes = await fetch(commandUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mouse:wheel',
        args: {
          profileId: sessionId,
          deltaX: 0,
          deltaY: Math.max(-800, Math.min(800, Number(distance) || 0)),
        },
      }),
    });
    const wheelData = await wheelRes.json().catch(() => ({} as any));
    if (wheelData?.ok === false || wheelData?.success === false) {
      return {
        scrolled: false,
        previousPosition,
        newPosition: previousPosition,
        error: wheelData?.error || 'mouse_wheel_failed',
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 800));

    const afterRes = await fetch(commandUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate',
        args: { profileId: sessionId, script: 'window.scrollY || 0' },
      }),
    });
    const afterData = await afterRes.json().catch(() => ({} as any));
    const newPosition = Number(afterData?.data?.result ?? afterData?.body?.result ?? afterData?.result ?? previousPosition) || previousPosition;

    return { scrolled: true, previousPosition, newPosition };
  } catch (error: any) {
    return {
      scrolled: false,
      previousPosition: 0,
      newPosition: 0,
      error: `Scroll error: ${error.message}`
    };
  }
}
