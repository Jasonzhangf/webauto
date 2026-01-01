import { AIProvider } from './AIProvider.js';
import { HTMLSimplifier } from './HTMLSimplifier.js';
import type {
  InteractiveDOMBuilderConfig,
  BuildStep,
  DOMAnalysisRequest,
  ContainerFieldsRequest
} from './types.js';
import * as readline from 'node:readline';

/**
 * 交互式 DOM 构建器
 * 通过命令行交互和 AI 辅助，帮助用户分析 DOM 并生成容器定义
 */
export class InteractiveDOMBuilder {
  private config: InteractiveDOMBuilderConfig;
  private aiProvider: AIProvider;
  private steps: BuildStep[] = [];
  private rl: readline.Interface;
  private currentHTML: string = '';

  constructor(config: InteractiveDOMBuilderConfig) {
    this.config = config;
    this.aiProvider = new AIProvider(config.provider);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * 询问用户输入
   */
  private async ask(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * 打印消息
   */
  private log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info'): void {
    const prefix = {
      info: '💡',
      success: '✅',
      error: '❌',
      warn: '⚠️'
    }[type];
    console.log(`${prefix} ${message}`);
  }

  /**
   * 获取页面 HTML
   */
  private async fetchPageHTML(): Promise<string> {
    const UNIFIED_API = 'http://127.0.0.1:7701';
    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile: this.config.profile,
          script: 'document.documentElement.outerHTML'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch HTML: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data || '';
  }

  /**
   * 获取指定选择器的元素 HTML
   */
  private async fetchElementHTML(selector: string): Promise<string> {
    const UNIFIED_API = 'http://127.0.0.1:7701';
    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile: this.config.profile,
          script: `
            const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
            el ? el.outerHTML : '';
          `
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch element HTML: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data || '';
  }

  /**
   * 高亮元素
   */
  private async highlightElement(selector: string, label?: string): Promise<void> {
    const UNIFIED_API = 'http://127.0.0.1:7701';
    await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:highlight',
        payload: {
          profile: this.config.profile,
          selector,
          options: {
            style: '3px solid #fbbc05',
            duration: 5000,
            sticky: false,
            label: label || selector
          }
        }
      })
    });
  }

  /**
   * 步骤 1: 分析主容器
   */
  private async stepAnalyzeMainContainer(): Promise<BuildStep> {
    const step: BuildStep = {
      id: 'main-container',
      type: 'selector',
      status: 'in-progress',
      prompt: '请描述你要提取的主容器（例如：微博的 Feed 列表容器）'
    };

    this.log('开始分析主容器...', 'info');
    
    const description = await this.ask('容器描述: ');
    step.userInput = description;

    // 获取页面 HTML
    this.log('正在获取页面 HTML...', 'info');
    this.currentHTML = await this.fetchPageHTML();

    // 调用 AI 分析（使用智能简化）
    this.log('正在调用 AI 分析...', 'info');
    this.log('正在简化 HTML...', 'info');
    
    const simplifiedHTML = HTMLSimplifier.extractRelevantFragment(
      this.currentHTML,
      description,
      40000
    );
    
    this.log(`HTML 大小: ${this.currentHTML.length} -> ${simplifiedHTML.length}`, 'info');
    
    const request: DOMAnalysisRequest = {
      html: simplifiedHTML,
      targetDescription: description,
      examples: [
        '使用 [class*=\'xxx\'] 来匹配动态 class 名',
        '优先使用结构稳定的选择器'
      ]
    };

    const result = await this.aiProvider.analyzeDOMSelector(request);
    
    if (!result.success || !result.selector) {
      step.status = 'failed';
      step.error = result.error;
      this.log(`分析失败: ${result.error}`, 'error');
      return step;
    }

    this.log(`AI 建议的选择器: ${result.selector}`, 'success');
    this.log(`置信度: ${result.confidence}`, 'info');
    this.log(`说明: ${result.explanation}`, 'info');

    // 高亮元素
    await this.highlightElement(result.selector, '主容器');

    // 询问用户是否满意
    const satisfied = await this.ask('是否满意这个选择器？(y/n): ');
    
    if (satisfied.toLowerCase() !== 'y') {
      // 显示备选方案
      if (result.alternatives && result.alternatives.length > 0) {
        this.log('备选方案:', 'info');
        result.alternatives.forEach((alt, i) => {
          console.log(`  ${i + 1}. ${alt.selector} (置信度: ${alt.confidence})`);
          console.log(`     ${alt.explanation}`);
        });
        
        const choice = await this.ask('选择备选方案序号，或输入自定义选择器: ');
        const index = parseInt(choice) - 1;
        if (!isNaN(index) && result.alternatives[index]) {
          result.selector = result.alternatives[index].selector;
        } else {
          result.selector = choice;
        }
      } else {
        const custom = await this.ask('请输入自定义选择器: ');
        result.selector = custom;
      }
    }

    step.status = 'completed';
    step.result = result;
    this.log(`主容器选择器确定: ${result.selector}`, 'success');

    return step;
  }

  /**
   * 步骤 2: 分析子容器（可选）
   */
  private async stepAnalyzeChildContainers(parentSelector: string): Promise<BuildStep> {
    const step: BuildStep = {
      id: 'child-containers',
      type: 'selector',
      status: 'in-progress',
      prompt: '是否需要分析子容器？(y/n)'
    };

    const needChild = await this.ask('是否需要分析子容器？(y/n): ');
    
    if (needChild.toLowerCase() !== 'y') {
      step.status = 'completed';
      step.result = { skip: true };
      return step;
    }

    const description = await this.ask('子容器描述（例如：单个帖子容器）: ');
    
    // 获取父容器的 HTML
    this.log('正在获取父容器 HTML...', 'info');
    const parentHTML = await this.fetchElementHTML(parentSelector);

    // 调用 AI 分析
    this.log('正在调用 AI 分析...', 'info');
    const request: DOMAnalysisRequest = {
      html: parentHTML,
      targetDescription: description,
      context: {
        parentSelector
      }
    };

    const result = await this.aiProvider.analyzeDOMSelector(request);
    
    if (!result.success || !result.selector) {
      step.status = 'failed';
      step.error = result.error;
      return step;
    }

    this.log(`AI 建议的选择器: ${result.selector}`, 'success');
    
    // 组合完整选择器用于高亮
    const fullSelector = `${parentSelector} ${result.selector}`;
    await this.highlightElement(fullSelector, '子容器');

    const satisfied = await this.ask('是否满意这个选择器？(y/n): ');
    if (satisfied.toLowerCase() !== 'y') {
      const custom = await this.ask('请输入自定义选择器: ');
      result.selector = custom;
    }

    step.status = 'completed';
    step.result = result;
    
    return step;
  }

  /**
   * 步骤 3: 分析字段
   */
  private async stepAnalyzeFields(containerSelector: string): Promise<BuildStep> {
    const step: BuildStep = {
      id: 'fields',
      type: 'fields',
      status: 'in-progress',
      prompt: '定义需要提取的字段'
    };

    const fieldDescriptions: Record<string, string> = {};
    
    this.log('请定义需要提取的字段（输入空行结束）:', 'info');
    
    while (true) {
      const fieldName = await this.ask('字段名（如 author）: ');
      if (!fieldName) break;
      
      const fieldDesc = await this.ask(`${fieldName} 的描述: `);
      fieldDescriptions[fieldName] = fieldDesc;
    }

    if (Object.keys(fieldDescriptions).length === 0) {
      step.status = 'completed';
      step.result = { skip: true };
      return step;
    }

    // 获取容器 HTML
    this.log('正在获取容器 HTML...', 'info');
    const containerHTML = await this.fetchElementHTML(containerSelector);

    // 调用 AI 分析字段
    this.log('正在调用 AI 分析字段...', 'info');
    const request: ContainerFieldsRequest = {
      html: containerHTML,
      containerSelector,
      fieldDescriptions
    };

    const result = await this.aiProvider.analyzeContainerFields(request);
    
    if (!result.success || !result.fields) {
      step.status = 'failed';
      step.error = result.error;
      return step;
    }

    // 显示结果
    this.log('字段分析结果:', 'success');
    for (const [fieldName, fieldInfo] of Object.entries(result.fields)) {
      console.log(`  ${fieldName}: ${fieldInfo.selector}`);
      console.log(`    置信度: ${fieldInfo.confidence}`);
      console.log(`    说明: ${fieldInfo.explanation}`);
    }

    step.status = 'completed';
    step.result = result;
    
    return step;
  }

  /**
   * 步骤 4: 保存容器定义
   */
  private async stepSaveDefinition(): Promise<BuildStep> {
    const step: BuildStep = {
      id: 'save',
      type: 'save',
      status: 'in-progress'
    };

    const containerName = await this.ask('容器 ID（如 weibo_main_page.feed_list）: ');
    const containerType = await this.ask('容器类型（page/collection/content）: ');

    // 从之前的步骤中获取结果
    const mainContainerStep = this.steps.find(s => s.id === 'main-container');
    const fieldsStep = this.steps.find(s => s.id === 'fields');

    const definition: any = {
      id: containerName,
      name: `自动生成的容器 - ${containerName}`,
      type: containerType,
      capabilities: ['highlight', 'extract'],
      selectors: [
        {
          css: (mainContainerStep?.result as any)?.selector || '',
          variant: 'primary',
          score: 1.0
        }
      ],
      operations: []
    };

    // 添加提取操作
    if (fieldsStep?.result && !(fieldsStep.result as any).skip) {
      definition.operations.push({
        type: 'extract',
        config: {
          fields: Object.entries((fieldsStep.result as any).fields || {}).reduce((acc, [name, info]) => {
            acc[name] = (info as any).selector;
            return acc;
          }, {} as Record<string, string>)
        }
      });
    }

    this.log('生成的容器定义:', 'success');
    console.log(JSON.stringify(definition, null, 2));

    const save = await this.ask('是否保存到文件？(y/n): ');
    if (save.toLowerCase() === 'y') {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      
      const filename = `${containerName.replace(/\./g, '_')}.json`;
      const filepath = path.join(process.cwd(), 'container-library', filename);
      
      await fs.writeFile(filepath, JSON.stringify(definition, null, 2));
      this.log(`已保存到: ${filepath}`, 'success');
    }

    step.status = 'completed';
    step.result = definition;
    
    return step;
  }

  /**
   * 执行交互式构建
   */
  async build(): Promise<void> {
    try {
      this.log('=== 交互式 DOM 容器构建器 ===', 'info');
      this.log(`目标 URL: ${this.config.url}`, 'info');
      this.log(`Profile: ${this.config.profile}`, 'info');
      this.log('', 'info');

      // 步骤 1: 分析主容器
      const step1 = await this.stepAnalyzeMainContainer();
      this.steps.push(step1);

      if (step1.status === 'failed') {
        this.log('构建失败', 'error');
        return;
      }

      const mainSelector = (step1.result as any).selector;

      // 步骤 2: 分析子容器
      const step2 = await this.stepAnalyzeChildContainers(mainSelector);
      this.steps.push(step2);

      // 步骤 3: 分析字段
      const step3 = await this.stepAnalyzeFields(mainSelector);
      this.steps.push(step3);

      // 步骤 4: 保存定义
      const step4 = await this.stepSaveDefinition();
      this.steps.push(step4);

      this.log('构建完成！', 'success');

    } catch (error) {
      this.log(`构建错误: ${error}`, 'error');
    } finally {
      this.rl.close();
    }
  }
}
