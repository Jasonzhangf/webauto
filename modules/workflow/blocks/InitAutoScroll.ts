/**
 * Workflow Block: InitAutoScroll
 *
 * 初始化滚动状态机
 */

export interface InitAutoScrollInput {
  sessionId: string;
  scrollStrategy?: 'smooth' | 'instant';
  scrollDistance?: number;
  serviceUrl?: string;
}

export interface InitAutoScrollOutput {
  scrollState: {
    initialized: true;
    currentPosition: number;
    strategy: string;
    distance: number;
  };
  error?: string;
}

/**
 * 初始化自动滚动
 *
 * @param input - 输入参数
 * @returns Promise<InitAutoScrollOutput>
 */
export async function execute(input: InitAutoScrollInput): Promise<InitAutoScrollOutput> {
  const { sessionId, scrollStrategy = 'smooth', scrollDistance = 800, serviceUrl = 'http://127.0.0.1:7704' } = input;

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
              window.__scrollState = {
                initialized: true,
                currentPosition: window.scrollY || 0,
                strategy: '${scrollStrategy}',
                distance: ${scrollDistance}
              };
              return window.__scrollState;
            })()
          `
        }
      })
    });

    const evalData = await evalRes.json();

    if (!evalData.success) {
      return {
        scrollState: {
          initialized: true,
          currentPosition: 0,
          strategy: scrollStrategy,
          distance: scrollDistance
        },
        error: 'Failed to initialize scroll state'
      };
    }

    return {
      scrollState: evalData.data
    };
  } catch (error: any) {
    return {
      scrollState: {
        initialized: true,
        currentPosition: 0,
        strategy: scrollStrategy,
        distance: scrollDistance
      },
      error: `Init error: ${error.message}`
    };
  }
}
