/**
 * Workflow Block: WaitStable
 *
 * 等待页面稳定信号
 */

export interface WaitStableInput {
  sessionId: string;
  checkInterval?: number;
  maxWait?: number;
  stableThreshold?: number;
  serviceUrl?: string;
}

export interface WaitStableOutput {
  isStable: boolean;
  waitTime: number;
  checks: number;
  error?: string;
}

/**
 * 等待页面稳定
 *
 * @param input - 输入参数
 * @returns Promise<WaitStableOutput>
 */
export async function execute(input: WaitStableInput): Promise<WaitStableOutput> {
  const {
    sessionId,
    checkInterval = 500,
    maxWait = 10000,
    stableThreshold = 3,
    serviceUrl = 'http://127.0.0.1:7704'
  } = input;

  const commandUrl = `${serviceUrl}/command`;
  const startTime = Date.now();
  let checks = 0;
  let lastHeight = 0;
  let stableCount = 0;

  try {
    while (Date.now() - startTime < maxWait) {
      checks++;

      const evalRes = await fetch(commandUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          args: {
            profileId: sessionId,
            script: `
              (() => {
                return document.body.scrollHeight;
              })()
            `
          }
        })
      });

      const evalData = await evalRes.json();

      if (evalData.success && evalData.data !== undefined) {
        const currentHeight = evalData.data;

        if (currentHeight === lastHeight) {
          stableCount++;
          if (stableCount >= stableThreshold) {
            const waitTime = Date.now() - startTime;
            return {
              isStable: true,
              waitTime,
              checks
            };
          }
        } else {
          stableCount = 0;
        }

        lastHeight = currentHeight;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return {
      isStable: false,
      waitTime: maxWait,
      checks,
      error: 'Timeout waiting for page stability'
    };
  } catch (error: any) {
    return {
      isStable: false,
      waitTime: Date.now() - startTime,
      checks,
      error: `WaitStable error: ${error.message}`
    };
  }
}
