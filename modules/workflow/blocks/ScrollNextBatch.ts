/**
 * Workflow Block: ScrollNextBatch
 *
 * 执行一次滚动并等待稳定
 */

export interface ScrollNextBatchInput {
  sessionId: string;
  distance?: number;
  behavior?: 'smooth' | 'instant';
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
  const { sessionId, distance = 800, behavior = 'smooth', serviceUrl = 'http://127.0.0.1:7704' } = input;

  const commandUrl = `${serviceUrl}/command`;

  try {
    const evalRes = await fetch(commandUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate',
        args: {
          profileId: sessionId,
          script: `
            (() => {
              const previousPosition = window.scrollY || 0;
              window.scrollBy({
                top: ${distance},
                behavior: '${behavior}'
              });
              const newPosition = window.scrollY || 0;
              return {
                scrolled: true,
                previousPosition,
                newPosition
              };
            })()
          `
        }
      })
    });

    const evalData = await evalRes.json();

    if (!evalData.success) {
      return {
        scrolled: false,
        previousPosition: 0,
        newPosition: 0,
        error: 'Failed to scroll'
      };
    }

    return evalData.data;
  } catch (error: any) {
    return {
      scrolled: false,
      previousPosition: 0,
      newPosition: 0,
      error: `Scroll error: ${error.message}`
    };
  }
}
