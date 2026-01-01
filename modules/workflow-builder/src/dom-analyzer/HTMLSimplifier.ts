/**
 * HTML 简化器 - 用于将大型 HTML 简化为可分析的片段
 */

export interface SimplifyOptions {
  maxLength?: number;
  removeAttributes?: string[];
  removeElements?: string[];
  keepStructure?: boolean;
  targetSelector?: string;
}

export class HTMLSimplifier {
  /**
   * 简化 HTML，减少体积但保留结构
   */
  static simplify(html: string, options: SimplifyOptions = {}): string {
    const {
      maxLength = 50000,
      removeAttributes = ['style', 'data-*', 'aria-*'],
      removeElements = ['script', 'style', 'noscript', 'svg', 'iframe'],
      keepStructure = true,
      targetSelector = null
    } = options;

    try {
      // 如果指定了目标选择器，只提取该部分
      if (targetSelector) {
        html = this.extractBySelector(html, targetSelector);
      }

      // 移除不需要的元素
      html = this.removeElements(html, removeElements);

      // 移除不需要的属性
      html = this.removeAttributes(html, removeAttributes);

      // 压缩空白
      html = this.compressWhitespace(html);

      // 如果仍然太大，进一步简化
      if (html.length > maxLength) {
        html = this.furtherSimplify(html, maxLength, keepStructure);
      }

      return html;
    } catch (error) {
      console.error('HTML simplification failed:', error);
      return html.substring(0, maxLength);
    }
  }

  /**
   * 通过选择器提取 HTML 片段
   */
  private static extractBySelector(html: string, selector: string): string {
    // 简单的正则提取（在浏览器环境中应使用 DOM API）
    // 这里使用启发式方法
    
    // 提取主要容器部分
    const patterns = [
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]*id=["']app["'][^>]*>([\s\S]*?)<\/div>/i,
      /<body[^>]*>([\s\S]*?)<\/body>/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return html;
  }

  /**
   * 移除指定的元素
   */
  private static removeElements(html: string, elements: string[]): string {
    for (const element of elements) {
      const pattern = new RegExp(`<${element}[^>]*>.*?<\/${element}>`, 'gis');
      html = html.replace(pattern, '');
      
      // 处理自闭合标签
      const selfClosing = new RegExp(`<${element}[^>]*\/>`, 'gi');
      html = html.replace(selfClosing, '');
    }
    return html;
  }

  /**
   * 移除指定的属性
   */
  private static removeAttributes(html: string, attributes: string[]): string {
    for (const attr of attributes) {
      if (attr.includes('*')) {
        // 处理通配符
        const prefix = attr.replace('*', '');
        const pattern = new RegExp(`\\s${prefix}[a-zA-Z0-9-]*=["'][^"']*["']`, 'g');
        html = html.replace(pattern, '');
      } else {
        const pattern = new RegExp(`\\s${attr}=["'][^"']*["']`, 'g');
        html = html.replace(pattern, '');
      }
    }
    return html;
  }

  /**
   * 压缩空白字符
   */
  private static compressWhitespace(html: string): string {
    return html
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
  }

  /**
   * 进一步简化（保留结构骨架）
   */
  private static furtherSimplify(html: string, maxLength: number, keepStructure: boolean): string {
    if (!keepStructure) {
      return html.substring(0, maxLength);
    }

    // 保留开始和结束部分
    const headerLength = Math.floor(maxLength * 0.3);
    const footerLength = Math.floor(maxLength * 0.1);
    const middleLength = maxLength - headerLength - footerLength;

    const header = html.substring(0, headerLength);
    const footer = html.substring(html.length - footerLength);
    
    // 中间部分提取结构骨架
    const middle = html.substring(headerLength, html.length - footerLength);
    const skeleton = this.extractSkeleton(middle, middleLength);

    return `${header}\n<!-- ... 省略部分内容 ... -->\n${skeleton}\n<!-- ... 省略部分内容 ... -->\n${footer}`;
  }

  /**
   * 提取 HTML 结构骨架
   */
  private static extractSkeleton(html: string, maxLength: number): string {
    // 只保留标签结构，移除内容
    const skeleton = html.replace(/>([^<]+)</g, '><');
    
    if (skeleton.length <= maxLength) {
      return skeleton;
    }

    // 进一步简化：只保留重要的结构标签
    const importantTags = ['main', 'article', 'section', 'div', 'header', 'footer', 'nav'];
    const lines = skeleton.split(/(?=<)/);
    const filtered = lines.filter(line => {
      return importantTags.some(tag => line.includes(`<${tag}`));
    });

    return filtered.join('').substring(0, maxLength);
  }

  /**
   * 智能提取相关片段（基于目标描述）
   */
  static extractRelevantFragment(html: string, targetDescription: string, maxLength: number = 50000): string {
    // 根据目标描述的关键词提取相关片段
    const keywords = this.extractKeywords(targetDescription);
    
    // 查找包含关键词的片段
    const fragments: Array<{ start: number; end: number; score: number }> = [];
    
    for (const keyword of keywords) {
      const pattern = new RegExp(`<[^>]*${keyword}[^>]*>([\\s\\S]{0,5000})<\/[^>]+>`, 'gi');
      let match;
      
      while ((match = pattern.exec(html)) !== null) {
        fragments.push({
          start: match.index,
          end: match.index + match[0].length,
          score: keywords.indexOf(keyword) + 1 // 关键词权重
        });
      }
    }

    if (fragments.length === 0) {
      // 没有找到相关片段，返回简化的全文
      return this.simplify(html, { maxLength });
    }

    // 合并重叠的片段
    const merged = this.mergeFragments(fragments);
    
    // 选择得分最高的片段
    const best = merged.sort((a, b) => b.score - a.score)[0];
    
    // 提取片段并添加上下文
    const contextBefore = 1000;
    const contextAfter = 1000;
    const start = Math.max(0, best.start - contextBefore);
    const end = Math.min(html.length, best.end + contextAfter);
    
    let fragment = html.substring(start, end);
    
    // 补全标签（确保结构完整）
    fragment = this.completeHTML(fragment);
    
    return this.simplify(fragment, { maxLength });
  }

  /**
   * 从描述中提取关键词
   */
  private static extractKeywords(description: string): string[] {
    const keywords: string[] = [];
    
    // 常见的容器关键词映射
    const keywordMap: Record<string, string[]> = {
      '帖子': ['post', 'feed', 'article', 'item'],
      '列表': ['list', 'feed', 'container', 'wrap'],
      '内容': ['content', 'body', 'text', 'detail'],
      '作者': ['author', 'user', 'name'],
      '时间': ['time', 'date', 'timestamp'],
      '评论': ['comment', 'reply'],
      '微博': ['weibo', 'wb', 'feed']
    };

    // 提取中文关键词
    for (const [cn, en] of Object.entries(keywordMap)) {
      if (description.includes(cn)) {
        keywords.push(...en);
      }
    }

    // 提取英文关键词
    const words = description.match(/[a-zA-Z]+/g) || [];
    keywords.push(...words.map(w => w.toLowerCase()));

    return [...new Set(keywords)];
  }

  /**
   * 合并重叠的片段
   */
  private static mergeFragments(fragments: Array<{ start: number; end: number; score: number }>) {
    if (fragments.length === 0) return [];

    // 按起始位置排序
    fragments.sort((a, b) => a.start - b.start);

    const merged = [fragments[0]];

    for (let i = 1; i < fragments.length; i++) {
      const current = fragments[i];
      const last = merged[merged.length - 1];

      if (current.start <= last.end) {
        // 重叠，合并
        last.end = Math.max(last.end, current.end);
        last.score += current.score;
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  /**
   * 补全 HTML 标签
   */
  private static completeHTML(fragment: string): string {
    // 简单的标签补全
    const openTags: string[] = [];
    const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
    let match;

    while ((match = tagPattern.exec(fragment)) !== null) {
      const tag = match[1];
      const isClosing = match[0].startsWith('</');

      if (isClosing) {
        if (openTags[openTags.length - 1] === tag) {
          openTags.pop();
        }
      } else if (!match[0].endsWith('/>')) {
        openTags.push(tag);
      }
    }

    // 关闭未闭合的标签
    while (openTags.length > 0) {
      const tag = openTags.pop();
      fragment += `</${tag}>`;
    }

    return fragment;
  }

  /**
   * 分块处理大型 HTML（用于分批发送给 AI）
   */
  static chunkHTML(html: string, chunkSize: number = 40000): string[] {
    const simplified = this.simplify(html, { maxLength: 200000 });
    
    if (simplified.length <= chunkSize) {
      return [simplified];
    }

    const chunks: string[] = [];
    const elements = simplified.match(/<[^>]+>[\s\S]*?<\/[^>]+>/g) || [];
    
    let currentChunk = '';
    
    for (const element of elements) {
      if (currentChunk.length + element.length > chunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = element;
      } else {
        currentChunk += element;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}
