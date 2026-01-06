/**
 * Workflow Block: PickSinglePost
 *
 * 在 snapshot 中定位单条帖子容器
 */

export interface PickSinglePostInput {
  sessionId: string;
  containerSelector: string;
  index?: number;
  serviceUrl?: string;
}

export interface PickSinglePostOutput {
  element: any;
  index: number;
  containerId: string;
  error?: string;
}

/**
 * 定位单条帖子容器
 *
 * @param input - 输入参数
 * @returns Promise<PickSinglePostOutput>
 */
export async function execute(input: PickSinglePostInput): Promise<PickSinglePostOutput> {
  const { sessionId, containerSelector, index = 0, serviceUrl = 'http://127.0.0.1:7704' } = input;

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
              const containers = document.querySelectorAll('${containerSelector}');
              if (!containers || containers.length === 0) {
                return { error: 'No containers found' };
              }
              const index = ${index};
              if (index >= containers.length) {
                return { error: 'Index out of range' };
              }
              const element = containers[index];
              return {
                tag: element.tagName,
                classes: Array.from(element.classList),
                text: element.textContent?.slice(0, 200),
                html: element.outerHTML.slice(0, 500)
              };
            })()
          `
        }
      })
    });

    const evalData = await evalRes.json();

    if (!evalData.success || evalData.data?.error) {
      return {
        element: null,
        index: 0,
        containerId: '',
        error: evalData.data?.error || 'Failed to pick element'
      };
    }

    return {
      element: evalData.data,
      index,
      containerId: `post-${index}`
    };
  } catch (error: any) {
    return {
      element: null,
      index: 0,
      containerId: '',
      error: `Pick error: ${error.message}`
    };
  }
}
