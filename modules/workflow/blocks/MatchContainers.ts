/**
 * Workflow Block: MatchContainers
 *
 * 执行容器匹配
 */

export interface MatchContainersInput {
  sessionId: string;
  rootSelector?: string;
  serviceUrl?: string;
}

export interface MatchContainersOutput {
  snapshot: {
    root: any;
    timestamp: number;
  };
  matchCount: number;
  rootContainerId: string;
  error?: string;
}

/**
 * 执行容器匹配
 *
 * @param input - 输入参数
 * @returns Promise<MatchContainersOutput>
 */
export async function execute(input: MatchContainersInput): Promise<MatchContainersOutput> {
  const { sessionId, rootSelector, serviceUrl = 'http://127.0.0.1:7704' } = input;

  const commandUrl = `${serviceUrl}/command`;

  try {
    const domRes = await fetch(commandUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate',
        args: {
          profileId: sessionId,
          script: `
            (() => {
              const root = document.querySelector('${rootSelector || "body"}');
              if (!root) return { error: 'Root not found' };
              return {
                tag: root.tagName,
                classes: Array.from(root.classList),
                html: root.outerHTML.slice(0, 1000)
              };
            })()
          `
        }
      })
    });

    const domData = await domRes.json();

    if (!domData.success) {
      return {
        snapshot: { root: null, timestamp: 0 },
        matchCount: 0,
        rootContainerId: '',
        error: `Failed to access DOM: ${domData.error}`
      };
    }

    return {
      snapshot: {
        root: domData.data,
        timestamp: Date.now()
      },
      matchCount: 1,
      rootContainerId: 'matched.container.id'
    };
  } catch (error: any) {
    return {
      snapshot: { root: null, timestamp: 0 },
      matchCount: 0,
      rootContainerId: '',
      error: `Match error: ${error.message}`
    };
  }
}
