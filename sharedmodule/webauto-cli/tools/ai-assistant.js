/**
 * AI Assistant Tool Class
 * 基于类的MCP工具示例
 */

class AIAssistantTool {
  constructor() {
    this.toolDefinition = {
      name: 'aiAssistant',
      description: 'AI-powered assistant for analyzing web content and providing suggestions',
      inputSchema: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'Task description for the AI assistant',
            enum: ['analyze', 'summarize', 'extract', 'suggest']
          },
          content: {
            type: 'string',
            description: 'Content to analyze or process'
          },
          context: {
            type: 'string',
            description: 'Additional context for the AI assistant (optional)'
          }
        },
        required: ['task', 'content']
      }
    };
  }

  /**
   * 获取MCP工具定义
   */
  getMCPTool() {
    return this.toolDefinition;
  }

  /**
   * 执行工具逻辑
   */
  async execute(args) {
    const { task, content, context } = args;
    
    // 模拟AI处理逻辑
    switch (task) {
      case 'analyze':
        return {
          content: [
            {
              type: 'text',
              text: `Content analysis completed. The content contains approximately ${content.split(' ').length} words and appears to be ${this.contentType(content)}.`
            }
          ]
        };
        
      case 'summarize':
        return {
          content: [
            {
              type: 'text',
              text: `Summary: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`
            }
          ]
        };
        
      case 'extract':
        return {
          content: [
            {
              type: 'text',
              text: `Extracted information: ${this.extractKeyInfo(content)}`
            }
          ]
        };
        
      case 'suggest':
        return {
          content: [
            {
              type: 'text',
              text: `AI Suggestions: ${this.generateSuggestions(content, context)}`
            }
          ]
        };
        
      default:
        throw new Error(`Unknown task: ${task}`);
    }
  }

  /**
   * 辅助方法：分析内容类型
   */
  contentType(content) {
    if (content.includes('<') && content.includes('>')) {
      return 'HTML content';
    }
    if (content.includes('{') && content.includes('}')) {
      return 'JSON data';
    }
    if (content.includes('http://') || content.includes('https://')) {
      return 'web content with URLs';
    }
    return 'plain text';
  }

  /**
   * 辅助方法：提取关键信息
   */
  extractKeyInfo(content) {
    // 简单的关键词提取
    const words = content.toLowerCase().split(/\s+/);
    const keywords = words.filter(word => 
      word.length > 3 && 
      !['this', 'that', 'with', 'from', 'they', 'have', 'been'].includes(word)
    );
    return `Key concepts: ${keywords.slice(0, 5).join(', ')}`;
  }

  /**
   * 辅助方法：生成建议
   */
  generateSuggestions(content, context) {
    return [
      'Consider breaking down complex tasks into smaller steps',
      'Use proper error handling for web automation',
      'Implement timeouts for network requests',
      'Add logging for debugging purposes'
    ].join(', ');
  }
}

module.exports = AIAssistantTool;