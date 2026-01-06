/**
 * Workflow Block: ExtractPostFields
 *
 * 抽取单条帖子字段数据，包含链接过滤
 */

export interface ExtractPostFieldsInput {
  sessionId: string;
  containerSelector: string;
  index?: number;
  serviceUrl?: string;
}

export interface ExtractPostFieldsOutput {
  fields: Record<string, any>;
  error?: string;
}

/**
 * 抽取字段
 *
 * @param input - 输入参数
 * @returns Promise<ExtractPostFieldsOutput>
 */
export async function execute(input: ExtractPostFieldsInput): Promise<ExtractPostFieldsOutput> {
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

              const getText = (selector) => {
                const node = element.querySelector(selector);
                return node ? node.textContent?.trim() : '';
              };

              // 过滤链接：只保留帖子链接
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
    });

    const evalData = await evalRes.json();

    if (!evalData.success || evalData.data?.error) {
      return {
        fields: {},
        error: evalData.data?.error || 'Failed to extract fields'
      };
    }

    return {
      fields: evalData.data
    };
  } catch (error: any) {
    return {
      fields: {},
      error: `Extract error: ${error.message}`
    };
  }
}
