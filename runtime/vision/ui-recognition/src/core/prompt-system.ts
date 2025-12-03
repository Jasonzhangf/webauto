/**
 * 标准化Prompt系统
 * 管理系统prompt、功能特定的固定prompt和上下文prompt
 */

export interface PromptTemplate {
  id: string;
  name: string;
  type: 'system' | 'function' | 'context' | 'followup';
  template: string;
  variables?: string[];
  category: 'recognition' | 'search' | 'action' | 'container' | 'context';
  priority: number;
}

export interface PromptContext {
  sessionId: string;
  previousResults: any[];
  currentTask: string;
  imageDescription?: string;
  userHistory: string[];
  contextSummary?: string;
}

export class PromptSystem {
  private templates: Map<string, PromptTemplate> = new Map();
  private contextCache: Map<string, PromptContext> = new Map();

  constructor() {
    this.initializeSystemPrompts();
    this.initializeFunctionPrompts();
  }

  /**
   * 初始化系统级prompt
   */
  private initializeSystemPrompts(): void {
    // 基础系统prompt
    this.addTemplate({
      id: 'ui-analysis-system',
      name: 'UI分析系统基础prompt',
      type: 'system',
      template: `You are a specialized UI analysis assistant with expertise in identifying and understanding user interface elements across different platforms (web, mobile, desktop).

Your core responsibilities:
1. Identify UI elements with precise coordinates
2. Classify elements by type and functionality
3. Understand element relationships and context
4. Provide actionable insights for automation

Guidelines:
- Always provide exact coordinates when possible
- Classify elements using standard UI terminology
- Consider the context and user intent
- Maintain consistency across recognition sessions
- Handle ambiguous cases gracefully

Current session context: {{context}}
Previous recognition results: {{previousResults}}`,
      variables: ['context', 'previousResults'],
      category: 'recognition',
      priority: 1
    });

    // 网页UI分析专用prompt
    this.addTemplate({
      id: 'web-ui-system',
      name: '网页UI分析系统prompt',
      type: 'system',
      template: `You are analyzing a web page interface. Focus on web-specific elements and patterns.

Web element types to identify:
- Interactive elements: buttons, links, form inputs, dropdowns, checkboxes, radio buttons
- Navigation elements: menus, breadcrumbs, pagination, tabs
- Content elements: headings, paragraphs, lists, tables, images
- Structural elements: headers, footers, sidebars, modals, tooltips

Web-specific considerations:
- Semantic HTML structure and accessibility roles
- Responsive design patterns
- Interactive states (hover, focus, active, disabled)
- Form validation and error states
- Dynamic content and loading states

Context: {{context}}
Previous analysis: {{previousResults}}`,
      variables: ['context', 'previousResults'],
      category: 'recognition',
      priority: 2
    });

    // 应用UI分析专用prompt
    this.addTemplate({
      id: 'app-ui-system',
      name: '应用UI分析系统prompt',
      type: 'system',
      template: `You are analyzing a native mobile or desktop application interface. Focus on platform-specific UI patterns.

App element types to identify:
- Native controls: buttons, text fields, sliders, switches, pickers
- Navigation: tab bars, navigation drawers, toolbars, breadcrumbs
- Views: lists, grids, cards, tables, carousels
- System elements: status bars, notifications, dialogs, menus

Platform-specific patterns:
- Mobile: gestures, safe areas, dynamic type, dark mode
- Desktop: keyboard shortcuts, mouse interactions, window management
- Cross-platform: responsive layouts, adaptive interfaces

Context: {{context}}
Previous analysis: {{previousResults}}`,
      variables: ['context', 'previousResults'],
      category: 'recognition',
      priority: 2
    });
  }

  /**
   * 初始化功能特定的固定prompt
   */
  private initializeFunctionPrompts(): void {
    // 基础识别功能prompt
    this.addTemplate({
      id: 'basic-recognition',
      name: '基础UI识别功能',
      type: 'function',
      template: `Please analyze the given image and identify all visible UI elements.

Tasks:
1. List all interactive elements with their coordinates
2. Classify each element by type and function
3. Note any unusual or custom UI components
4. Estimate confidence levels for each identification

Output format:
For each element provide:
- Type: [button/input/link/etc]
- Coordinates: [x1, y1, x2, y2]
- Text/Label: [visible text or description]
- Confidence: [0-1]
- Notes: [additional observations]

Query: {{query}}
Image context: {{imageDescription}}`,
      variables: ['query', 'imageDescription'],
      category: 'recognition',
      priority: 10
    });

    // 搜索功能prompt
    this.addTemplate({
      id: 'element-search',
      name: '元素搜索功能',
      type: 'function',
      template: `Search for specific UI elements in the image based on the query.

Search criteria: {{query}}
Search type: {{searchType}}
Previous results context: {{previousResults}}

Tasks:
1. Locate elements matching the search criteria
2. Provide exact coordinates for each match
3. Rank results by relevance and confidence
4. Suggest alternative elements if exact match not found

For each match provide:
- Element description
- Coordinates: [x1, y1, x2, y2]
- Match confidence
- Relevance score
- Alternative suggestions if applicable`,
      variables: ['query', 'searchType', 'previousResults'],
      category: 'search',
      priority: 10
    });

    // 操作模拟功能prompt
    this.addTemplate({
      id: 'action-simulation',
      name: '操作模拟功能',
      type: 'function',
      template: `Analyze the UI to determine how to perform the requested action.

Requested action: {{actionType}}
Target element: {{targetDescription}}
Context from previous analysis: {{previousResults}}

Tasks:
1. Identify the target element with precise coordinates
2. Determine the appropriate action parameters
3. Consider potential side effects or dependencies
4. Provide step-by-step execution instructions

Output format:
- Target coordinates: [x1, y1, x2, y2]
- Action type: [click/type/swipe/etc]
- Action parameters: [specific details]
- Preconditions: [requirements before action]
- Expected result: [what should happen]
- Potential issues: [warnings or considerations]`,
      variables: ['actionType', 'targetDescription', 'previousResults'],
      category: 'action',
      priority: 10
    });

    // 容器分析功能prompt
    this.addTemplate({
      id: 'container-analysis',
      name: '容器分析功能',
      type: 'function',
      template: `Analyze the UI structure to identify containers and element relationships.

Analysis focus: {{analysisType}}
Previous element data: {{previousResults}}

Tasks:
1. Identify container boundaries and hierarchies
2. Group related elements into logical containers
3. Determine spatial relationships between elements
4. Infer container purposes and functionality

Container types to identify:
- Layout containers: grids, flexboxes, sections
- Functional containers: forms, menus, toolbars
- Visual containers: cards, panels, modals
- Navigation containers: headers, footers, sidebars

For each container provide:
- Type and purpose
- Boundary coordinates
- Child elements
- Relationship to other containers`,
      variables: ['analysisType', 'previousResults'],
      category: 'container',
      priority: 10
    });

    // 上下文分析功能prompt
    this.addTemplate({
      id: 'context-analysis',
      name: '上下文分析功能',
      type: 'function',
      template: `Analyze the overall UI context and user flow patterns.

Context type: {{contextType}}
Session history: {{sessionHistory}}
Previous recognition results: {{previousResults}}

Tasks:
1. Identify the current page/screen type and purpose
2. Analyze user flow and possible next actions
3. Detect patterns and recurring elements
4. Predict user intent based on UI state

Context elements to consider:
- Page type: [landing/search/form/dashboard/etc]
- User journey stage: [discovery/interaction/completion/etc]
- Available actions and their prominence
- Information hierarchy and visual flow
- Error states and validation messages

Provide analysis including:
- Current context summary
- Likely user goals
- Recommended next actions
- Potential friction points`,
      variables: ['contextType', 'sessionHistory', 'previousResults'],
      category: 'context',
      priority: 10
    });
  }

  /**
   * 添加新的prompt模板
   */
  addTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * 生成完整的prompt
   */
  generatePrompt(
    templateId: string,
    context: PromptContext,
    additionalVariables?: Record<string, any>
  ): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Prompt template not found: ${templateId}`);
    }

    let prompt = template.template;

    // 替换基础变量
    prompt = prompt.replace(/\{\{context\}\}/g, this.generateContextSummary(context));
    prompt = prompt.replace(/\{\{previousResults\}\}/g, this.formatPreviousResults(context.previousResults));
    prompt = prompt.replace(/\{\{sessionHistory\}\}/g, context.userHistory.join('\n'));
    prompt = prompt.replace(/\{\{currentTask\}\}/g, context.currentTask);

    // 替换额外变量
    if (additionalVariables) {
      Object.entries(additionalVariables).forEach(([key, value]) => {
        prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
      });
    }

    return prompt;
  }

  /**
   * 生成上下文摘要
   */
  private generateContextSummary(context: PromptContext): string {
    const parts: string[] = [];

    parts.push(`Session: ${context.sessionId}`);
    parts.push(`Current task: ${context.currentTask}`);

    if (context.imageDescription) {
      parts.push(`Image: ${context.imageDescription}`);
    }

    if (context.previousResults.length > 0) {
      parts.push(`Previous elements found: ${context.previousResults.length}`);
    }

    if (context.contextSummary) {
      parts.push(`Context: ${context.contextSummary}`);
    }

    return parts.join('\n');
  }

  /**
   * 格式化之前的结果
   */
  private formatPreviousResults(results: any[]): string {
    if (results.length === 0) {
      return 'No previous results';
    }

    return results.map((result, index) => {
      return `Result ${index + 1}: ${JSON.stringify(result, null, 2)}`;
    }).join('\n\n');
  }

  /**
   * 管理会话上下文
   */
  updateContext(sessionId: string, updates: Partial<PromptContext>): void {
    const existing = this.contextCache.get(sessionId) || {
      sessionId,
      previousResults: [],
      currentTask: '',
      userHistory: []
    };

    this.contextCache.set(sessionId, { ...existing, ...updates });
  }

  /**
   * 清理过期的上下文
   */
  cleanupContext(maxAge: number = 30 * 60 * 1000): void {
    const now = Date.now();
    for (const [sessionId, context] of this.contextCache.entries()) {
      const lastUpdate = context as any;
      if (now - (lastUpdate.lastUpdate || 0) > maxAge) {
        this.contextCache.delete(sessionId);
      }
    }
  }

  /**
   * 获取可用的prompt模板列表
   */
  getAvailableTemplates(category?: string): PromptTemplate[] {
    const templates = Array.from(this.templates.values());
    return category ? templates.filter(t => t.category === category) : templates;
  }
}

export const promptSystem = new PromptSystem();