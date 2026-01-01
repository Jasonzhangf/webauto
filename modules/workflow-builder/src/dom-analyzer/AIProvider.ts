import type {
  AIProviderConfig,
  DOMAnalysisRequest,
  DOMAnalysisResponse,
  ContainerFieldsRequest,
  ContainerFieldsResponse
} from './types.js';

/**
 * AI Provider - 用于调用 AI 模型分析 DOM
 */
export class AIProvider {
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = {
      baseUrl: config.baseUrl || 'http://127.0.0.1:5555',
      model: config.model || 'gpt-4',
      apiKey: config.apiKey
    };
  }

  /**
   * 调用 AI 模型
   */
  private async callAI(messages: Array<{ role: string; content: string }>): Promise<string> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: 0.1,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  /**
   * 分析 DOM，生成 CSS 选择器
   */
  async analyzeDOMSelector(request: DOMAnalysisRequest): Promise<DOMAnalysisResponse> {
    try {
      const systemPrompt = `你是一个专业的 Web 自动化工程师，擅长分析 HTML 结构并生成精确的 CSS 选择器。

你的任务是：
1. 分析提供的 HTML 片段
2. 根据目标描述，找到最合适的元素
3. 生成稳定、可靠的 CSS 选择器
4. 使用属性选择器（如 [class*='xxx']）来适应动态 class 名
5. 优先使用结构稳定的选择器，避免使用具体的 class 哈希值

请以 JSON 格式返回：
{
  "selector": "CSS选择器",
  "confidence": 0.0-1.0,
  "explanation": "为什么选择这个选择器",
  "alternatives": [
    {
      "selector": "备选选择器1",
      "confidence": 0.0-1.0,
      "explanation": "说明"
    }
  ]
}`;

      const userPrompt = `目标描述：${request.targetDescription}

HTML 片段：
\`\`\`html
${request.html}
\`\`\`

${request.examples ? `示例：\n${request.examples.join('\n')}` : ''}

请分析并返回 JSON 格式的结果。`;

      const aiResponse = await this.callAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      // 解析 AI 响应
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI response is not valid JSON');
      }

      const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      
      return {
        success: true,
        selector: result.selector,
        confidence: result.confidence || 0.8,
        explanation: result.explanation,
        alternatives: result.alternatives || []
      };

    } catch (error) {
      return {
        success: false,
        error: `AI analysis failed: ${error}`
      };
    }
  }

  /**
   * 分析容器字段，生成每个字段的选择器
   */
  async analyzeContainerFields(request: ContainerFieldsRequest): Promise<ContainerFieldsResponse> {
    try {
      const systemPrompt = `你是一个专业的 Web 自动化工程师，擅长分析容器内的字段结构。

你的任务是：
1. 分析容器的 HTML 结构
2. 为每个字段生成相对于容器的 CSS 选择器
3. 选择器应该是相对路径（在容器内部查找）
4. 使用属性选择器适应动态 class 名

请以 JSON 格式返回：
{
  "fields": {
    "字段名1": {
      "selector": "相对选择器",
      "confidence": 0.0-1.0,
      "explanation": "说明"
    },
    ...
  }
}`;

      const fieldsList = Object.entries(request.fieldDescriptions)
        .map(([name, desc]) => `- ${name}: ${desc}`)
        .join('\n');

      const userPrompt = `容器选择器：${request.containerSelector}

需要提取的字段：
${fieldsList}

容器 HTML 片段：
\`\`\`html
${request.html}
\`\`\`

请为每个字段生成相对于容器的选择器，返回 JSON 格式。`;

      const aiResponse = await this.callAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      // 解析 AI 响应
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI response is not valid JSON');
      }

      const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      
      return {
        success: true,
        fields: result.fields || {}
      };

    } catch (error) {
      return {
        success: false,
        error: `AI analysis failed: ${error}`
      };
    }
  }

  /**
   * 验证选择器是否有效
   */
  async validateSelector(html: string, selector: string): Promise<{ valid: boolean; matchCount: number }> {
    try {
      // 这里需要在浏览器环境中验证
      // 暂时返回模拟结果
      return {
        valid: true,
        matchCount: 1
      };
    } catch (error) {
      return {
        valid: false,
        matchCount: 0
      };
    }
  }
}
