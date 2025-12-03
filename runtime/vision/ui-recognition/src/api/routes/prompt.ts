/**
 * Prompt管理API路由
 * 支持系统提示词的设置、管理和持久化
 */

import { Router } from 'express';
import { promptSystem } from '../../core/prompt-system';
import { config } from '../../core/config';
import { logger } from '../../core/logger';
import { promises as fs } from 'fs';
import { join } from 'path';

const router = Router();

// 系统提示词配置文件路径
const PROMPT_CONFIG_PATH = join(process.cwd(), 'config', 'system-prompts.json');

/**
 * 获取所有可用的prompt模板
 */
router.get('/templates', async (req, res) => {
  try {
    const { category } = req.query;
    const templates = promptSystem.getAvailableTemplates(category as string);

    res.json({
      success: true,
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        category: t.category,
        priority: t.priority,
        variables: t.variables
      })),
      total: templates.length
    });
  } catch (error) {
    logger.error('获取prompt模板失败:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get prompt templates',
      code: 'GET_TEMPLATES_ERROR'
    });
  }
});

/**
 * 获取当前系统提示词配置
 */
router.get('/system', async (req, res) => {
  try {
    const systemPrompts = await loadSystemPrompts();

    res.json({
      success: true,
      systemPrompts: {
        uiAnalysis: systemPrompts.uiAnalysis,
        webSpecific: systemPrompts.webSpecific,
        appSpecific: systemPrompts.appSpecific,
        searchSpecific: systemPrompts.searchSpecific,
        actionSpecific: systemPrompts.actionSpecific
      },
      metadata: {
        lastUpdated: systemPrompts.lastUpdated,
        version: systemPrompts.version
      }
    });
  } catch (error) {
    logger.error('获取系统提示词失败:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system prompts',
      code: 'GET_SYSTEM_PROMPTS_ERROR'
    });
  }
});

/**
 * 设置系统提示词
 */
router.post('/system', async (req, res) => {
  try {
    const {
      uiAnalysis,
      webSpecific,
      appSpecific,
      searchSpecific,
      actionSpecific
    } = req.body;

    // 验证输入
    if (!uiAnalysis || typeof uiAnalysis !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'UI analysis prompt is required',
        code: 'INVALID_UI_ANALYSIS_PROMPT'
      });
    }

    // 构建系统提示词配置
    const systemPrompts = {
      uiAnalysis,
      webSpecific: webSpecific || '',
      appSpecific: appSpecific || '',
      searchSpecific: searchSpecific || '',
      actionSpecific: actionSpecific || '',
      lastUpdated: new Date().toISOString(),
      version: '1.0.0'
    };

    // 保存到文件
    await saveSystemPrompts(systemPrompts);

    // 更新运行时的prompt系统
    updateRuntimePrompts(systemPrompts);

    logger.info('系统提示词已更新', {
      timestamp: systemPrompts.lastUpdated,
      version: systemPrompts.version
    });

    res.json({
      success: true,
      message: 'System prompts updated successfully',
      systemPrompts: {
        uiAnalysis,
        webSpecific,
        appSpecific,
        searchSpecific,
        actionSpecific
      },
      metadata: {
        lastUpdated: systemPrompts.lastUpdated,
        version: systemPrompts.version
      }
    });
  } catch (error) {
    logger.error('设置系统提示词失败:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update system prompts',
      code: 'UPDATE_SYSTEM_PROMPTS_ERROR'
    });
  }
});

/**
 * 重置系统提示词为默认值
 */
router.post('/system/reset', async (req, res) => {
  try {
    const defaultPrompts = getDefaultSystemPrompts();

    await saveSystemPrompts(defaultPrompts);
    updateRuntimePrompts(defaultPrompts);

    logger.info('系统提示词已重置为默认值');

    res.json({
      success: true,
      message: 'System prompts reset to default',
      systemPrompts: defaultPrompts
    });
  } catch (error) {
    logger.error('重置系统提示词失败:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset system prompts',
      code: 'RESET_SYSTEM_PROMPTS_ERROR'
    });
  }
});

/**
 * 生成包含系统提示词的完整prompt
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      templateId,
      context,
      additionalVariables,
      useSystemPrompts = true
    } = req.body;

    if (!templateId) {
      return res.status(400).json({
        success: false,
        error: 'Template ID is required',
        code: 'MISSING_TEMPLATE_ID'
      });
    }

    // 加载系统提示词
    const systemPrompts = useSystemPrompts ? await loadSystemPrompts() : null;

    // 构建上下文
    const promptContext = {
      sessionId: context.sessionId || 'default',
      previousResults: context.previousResults || [],
      currentTask: context.currentTask || '',
      userHistory: context.userHistory || [],
      imageDescription: context.imageDescription,
      contextSummary: context.contextSummary
    };

    // 生成基础prompt
    let fullPrompt = promptSystem.generatePrompt(templateId, promptContext, additionalVariables);

    // 添加系统提示词前缀
    if (systemPrompts) {
      const systemPromptPrefix = buildSystemPromptPrefix(systemPrompts, context);
      fullPrompt = `${systemPromptPrefix}\n\n${fullPrompt}`;
    }

    res.json({
      success: true,
      prompt: fullPrompt,
      metadata: {
        templateId,
        usedSystemPrompts: useSystemPrompts,
        contextSize: promptContext.previousResults.length,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('生成prompt失败:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate prompt',
      code: 'GENERATE_PROMPT_ERROR'
    });
  }
});

/**
 * 验证prompt模板
 */
router.post('/validate', async (req, res) => {
  try {
    const { template } = req.body;

    if (!template || typeof template !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Template is required',
        code: 'MISSING_TEMPLATE'
      });
    }

    // 检查变量占位符
    const variablePattern = /\{\{(\w+)\}\}/g;
    const variables = [];
    let match;

    while ((match = variablePattern.exec(template)) !== null) {
      variables.push(match[1]);
    }

    // 检查模板长度
    const issues = [];
    if (template.length > 10000) {
      issues.push('Template is too long (>10,000 characters)');
    }

    if (template.length < 50) {
      issues.push('Template is too short (<50 characters)');
    }

    res.json({
      success: true,
      validation: {
        isValid: issues.length === 0,
        variables: [...new Set(variables)],
        length: template.length,
        issues
      }
    });
  } catch (error) {
    logger.error('验证prompt模板失败:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate template',
      code: 'VALIDATE_TEMPLATE_ERROR'
    });
  }
});

/**
 * 加载系统提示词配置
 */
async function loadSystemPrompts(): Promise<any> {
  try {
    const configData = await fs.readFile(PROMPT_CONFIG_PATH, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    // 如果文件不存在，返回默认配置
    logger.warn('系统提示词配置文件不存在，使用默认配置');
    return getDefaultSystemPrompts();
  }
}

/**
 * 保存系统提示词配置
 */
async function saveSystemPrompts(prompts: any): Promise<void> {
  try {
    // 确保配置目录存在
    await fs.mkdir(join(PROMPT_CONFIG_PATH, '..'), { recursive: true });
    await fs.writeFile(PROMPT_CONFIG_PATH, JSON.stringify(prompts, null, 2));
  } catch (error) {
    throw new Error(`Failed to save system prompts: ${error.message}`);
  }
}

/**
 * 获取默认系统提示词
 */
function getDefaultSystemPrompts(): any {
  return {
    uiAnalysis: `You are a specialized UI analysis assistant with expertise in identifying and understanding user interface elements across different platforms (web, mobile, desktop).

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
- Handle ambiguous cases gracefully`,

    webSpecific: `When analyzing web interfaces, focus on:
- Semantic HTML structure and accessibility roles
- Responsive design patterns
- Interactive states (hover, focus, active, disabled)
- Form validation and error states
- Dynamic content and loading states`,

    appSpecific: `When analyzing native app interfaces, focus on:
- Platform-specific UI patterns and conventions
- Native controls and system integration
- Touch interactions and gestures
- Platform accessibility features
- App navigation patterns`,

    searchSpecific: `When searching for elements:
- Use fuzzy matching for text searches
- Consider visual similarity for image searches
- Provide confidence scores for matches
- Suggest alternative elements when exact matches aren't found`,

    actionSpecific: `When suggesting actions:
- Consider element types and appropriate interactions
- Account for platform-specific behaviors
- Provide clear step-by-step instructions
- Highlight potential side effects or dependencies`,

    lastUpdated: new Date().toISOString(),
    version: '1.0.0'
  };
}

/**
 * 更新运行时的prompt系统
 */
function updateRuntimePrompts(systemPrompts: any): void {
  // 这里可以更新prompt系统的运行时配置
  // 例如更新系统模板或缓存
  logger.info('运行时prompt系统已更新');
}

/**
 * 构建系统提示词前缀
 */
function buildSystemPromptPrefix(systemPrompts: any, context: any): string {
  let prefix = systemPrompts.uiAnalysis;

  // 根据上下文添加特定提示
  if (context.contextType === 'web' && systemPrompts.webSpecific) {
    prefix += '\n\n' + systemPrompts.webSpecific;
  } else if (context.contextType === 'app' && systemPrompts.appSpecific) {
    prefix += '\n\n' + systemPrompts.appSpecific;
  }

  if (context.operationType === 'search' && systemPrompts.searchSpecific) {
    prefix += '\n\n' + systemPrompts.searchSpecific;
  } else if (context.operationType === 'action' && systemPrompts.actionSpecific) {
    prefix += '\n\n' + systemPrompts.actionSpecific;
  }

  return prefix;
}

export default router;