/**
 * Workflow Block: CollectBatch
 *
 * 批量采集指定数量的帖子
 */

export interface CollectBatchInput {
  sessionId: string;
  targetCount: number;
  containerSelector: string;
  scrollDistance?: number;
  stableWait?: number;
  serviceUrl?: string;
}

export interface CollectBatchOutput {
  collectedPosts: any[];
  collectedCount: number;
  targetCount: number;
  error?: string;
}

/**
 * 批量采集
 *
 * @param input - 输入参数
 * @returns Promise<CollectBatchOutput>
 */
export async function execute(input: CollectBatchInput): Promise<CollectBatchOutput> {
  const {
    sessionId,
    targetCount,
    containerSelector,
    scrollDistance = 800,
    stableWait = 10000,
    serviceUrl = 'http://127.0.0.1:7704'
  } = input;

  const commandUrl = `${serviceUrl}/command`;
  const collectedPosts: any[] = [];

  try {
    // 初始化
    await fetch(commandUrl, {
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
                currentPosition: 0,
                scrollDistance: ${scrollDistance}
              };
              return window.__scrollState;
            })()
          `
        }
      })
    });

    // 循环采集
    while (collectedPosts.length < targetCount) {
      const index = await fetch(commandUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          args: {
            profileId: sessionId,
            script: `
              (() => {
                const containers = document.querySelectorAll('${containerSelector}');
                return containers.length;
              })()
            `
          }
        })
      }).then(r => r.json().then(d => d.data));

      const result = await fetch(commandUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          args: {
            profileId: sessionId,
            script: `
              (() => {
                const element = document.querySelectorAll('${containerSelector}')[${collectedPosts.length}];
                if (!element) return { error: 'No element' };

                const getText = (selector) => {
                  const node = element.querySelector(selector);
                  return node ? node.textContent?.trim() : '';
                };

                const isPostUrl = (url) => {
                  if (!url) return false;
                  // 帖子URL: weibo.com/数字/帖子ID，其中帖子ID长度>4位
                  return /^https?:\\/\\/(?:www\\.)?weibo\\.com\\/\\d+\\/[a-zA-Z0-9]{5,}/.test(url) ||
                         /^https?:\\/\\/(?:m\\.)?weibo\\.com\\/detail\\/[a-zA-Z0-9]{5,}/.test(url);
                };

                const isProfileUrl = (url) => {
                  if (!url) return false;
                  // 用户主页: /u/数字ID 或 单段用户名
                  return /^https?:\\/\\/(?:www\\.)?weibo\\.com\\/u\\/\\d+/.test(url) ||
                         /^https?:\\/\\/(?:www\\.)?weibo\\.com\\/[a-zA-Z0-9_-]{1,16}\\/?$/.test(url);
                };

                const links = Array.from(element.querySelectorAll('a'))
                  .map(a => a.href)
                  .filter(url => isPostUrl(url) && !isProfileUrl(url));

                return {
                  author: getText('.woo-font.woo-font--headline'),
                  content: getText('.detail_wbtext_4CRf9, .detail_wbtext_4CRf9 *'),
                  time: getText('time, .wb_time'),
                  postLinks: links
                };
              })()
            `
          }
        })
      }).then(r => r.json());

      if (result.success && !result.data?.error) {
        collectedPosts.push(result.data);
      }

      if (collectedPosts.length >= targetCount) {
        break;
      }

      await fetch(commandUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          args: {
            profileId: sessionId,
            script: `window.scrollBy({ top: ${scrollDistance}, behavior: 'smooth' })`
          }
        })
      });

      await new Promise(resolve => setTimeout(resolve, stableWait));
    }

    return {
      collectedPosts,
      collectedCount: collectedPosts.length,
      targetCount
    };
  } catch (error: any) {
    return {
      collectedPosts,
      collectedCount: collectedPosts.length,
      targetCount,
      error: `Collect error: ${error.message}`
    };
  }
}
