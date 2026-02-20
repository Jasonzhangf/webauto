/**
 * Workflow Block: RenderMarkdown
 *
 * 渲染 Markdown 输出
 */

export interface RenderMarkdownInput {
  posts: Array<{
    author?: string;
    content?: string;
    time?: string;
    postLinks?: string[];
  }>;
  template?: 'default' | 'compact' | 'detailed';
}

export interface RenderMarkdownOutput {
  markdown: string;
  count: number;
  error?: string;
}

/**
 * 渲染 Markdown
 *
 * @param input - 输入参数
 * @returns RenderMarkdownOutput
 */
export async function execute(input: RenderMarkdownInput): Promise<RenderMarkdownOutput> {
  const { posts, template = 'default' } = input;

  if (!posts || !Array.isArray(posts)) {
    return {
      markdown: '',
      count: 0,
      error: 'Invalid posts data'
    };
  }

  const lines: string[] = [];
  lines.push(`# 微博采集结果`);
  const ts = getCurrentTimestamp();
  lines.push(`采集时间: ${ts.collectedAt}`);
  lines.push(`采集时间(本地): ${ts.collectedAtLocal}`);
  lines.push(`总计: ${posts.length} 条`);
  lines.push('');

  posts.forEach((post, index) => {
    lines.push(`## ${index + 1}`);

    if (post.author) {
      lines.push(`**作者**: ${post.author}`);
    }

    if (post.time) {
      lines.push(`**时间**: ${post.time}`);
    }

    if (post.postLinks && post.postLinks.length > 0) {
      lines.push(`**帖子链接**: ${post.postLinks[0]}`);
    }

    lines.push('');
    lines.push(post.content || '(无内容)');
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  return {
    markdown: lines.join('\n'),
    count: posts.length
  };
}
import { getCurrentTimestamp } from '../../collection-manager/date-utils.js';
