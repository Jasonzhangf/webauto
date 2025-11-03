/**
 * 高层UI容器系统 - 智能UI分析API路由
 * 提供现代化的UI控件系统对外接口
 */

import { Router } from 'express';
import { MemorySystem } from '../../services/memory-system';
import { RecognitionServiceClient } from '../../services/recognition-client';
import { ContainerBuilder } from '../../core/container-builder';
import { ControlBuilder } from '../../core/control-builder';

const router = Router();

// 创建服务实例
const memorySystem = new MemorySystem();
const recognitionClient = new RecognitionServiceClient();
const containerBuilder = new ContainerBuilder();
const controlBuilder = new ControlBuilder();

/**
 * 智能UI分析
 * POST /api/ui/analysis
 */
router.post('/analysis', async (req, res) => {
  try {
    const {
      image,
      analysisLevel = 'deep',
      context,
      applicationInfo,
      userId,
      sessionId
    } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'Image is required'
      });
    }

    // 第一步：底层识别
    const elements = await recognitionClient.recognizeElements(
      image,
      context?.userIntent || '全面分析页面UI结构'
    );

    // 第二步：识别应用信息
    const applicationId = applicationInfo?.applicationId ||
                         inferApplicationId(context?.pageUrl) ||
                         'unknown-app';

    const applicationType = applicationInfo?.applicationType ||
                           inferApplicationType(elements, context) ||
                           'website';

    const platform = applicationInfo?.platform ||
                    inferPlatform(elements, context) ||
                    'web';

    // 第三步：记录到记忆系统
    const uiStructure = await memorySystem.recordUIStructure(
      applicationId,
      applicationType,
      platform,
      elements,
      {
        pageUrl: context?.pageUrl,
        pageTitle: context?.pageTitle,
        userId,
        sessionId
      }
    );

    // 第四步：构建智能UI结构
    const pageAnalysis = await buildIntelligentAnalysis(
      applicationId,
      elements,
      uiStructure,
      analysisLevel,
      context
    );

    // 第五步：生成智能建议
    const suggestions = await generateIntelligentSuggestions(
      applicationId,
      pageAnalysis,
      context
    );

    res.json({
      success: true,
      application_info: {
        id: applicationId,
        type: applicationType,
        name: applicationInfo?.applicationName || extractAppName(applicationId),
        platform,
        confidence: 0.9
      },
      page_analysis: {
        structure_id: uiStructure.id,
        structure_type: uiStructure.structure_type,
        confidence_score: uiStructure.stability_score,
        learning_progress: memorySystem.getApplicationStats(applicationId)?.learning_progress || 0,

        // 主要容器
        main_containers: pageAnalysis.containers.map(container => ({
          id: container.id,
          type: container.type,
          purpose: container.properties.description || `${container.type}容器`,
          confidence: container.metadata.confidence,
          controls: container.children.length,
          relationships: container.relationships.length,

          // 智能信息
          intelligence: {
            purpose: container.purpose,
            intent: container.intent,
            suggested_actions: container.suggestedActions.map(action => ({
              action: action.title,
              description: action.description,
              confidence: action.confidence,
              risk_level: action.risk_level,
              steps: action.steps.length
            }))
          }
        })),

        // 智能分析结果
        intelligent_insights: {
          page_type: pageAnalysis.pageType,
          user_intent: pageAnalysis.userIntent,
          completion_probability: pageAnalysis.completionProbability,
          estimated_time: pageAnalysis.estimatedTime,
          difficulty_level: pageAnalysis.difficultyLevel,
          accessibility_score: pageAnalysis.accessibilityScore
        },

        // 用户流程分析
        user_flows: pageAnalysis.userFlows.map(flow => ({
          name: flow.name,
          description: flow.description,
          steps: flow.steps.length,
          success_rate: flow.successRate,
          estimated_time: flow.estimatedTime,
          confidence: flow.confidence
        })),

        // 智能建议
        smart_suggestions: suggestions
      },

      // 学习数据
      learning_info: {
        is_first_visit: !memorySystem.getApplicationStats(applicationId),
        learning_suggestions: await memorySystem.getLearningSuggestions(applicationId),
        adaptation_ready: true,
        memory_confidence: memorySystem.getApplicationStats(applicationId)?.confidence_score || 0
      },

      processing_time: Date.now(),
      session_id: sessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('UI analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 增量分析更新
 * POST /api/ui/update
 */
router.post('/update', async (req, res) => {
  try {
    const {
      applicationId,
      image,
      changes,
      context,
      userId,
      sessionId
    } = req.body;

    // 执行增量识别
    const elements = await recognitionClient.recognizeElements(image);

    // 检测变化
    const detectedChanges = await detectChanges(applicationId, elements);

    // 更新记忆系统
    const adaptationSuccess = await memorySystem.adaptToChanges(applicationId, [
      ...detectedChanges,
      ...(changes || [])
    ]);

    res.json({
      success: true,
      changes_detected: detectedChanges.length,
      adaptation_successful: adaptationSuccess,
      updated_elements: elements.length,
      learning_progress: memorySystem.getApplicationStats(applicationId)?.learning_progress || 0
    });

  } catch (error) {
    console.error('UI update failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Update failed'
    });
  }
});

/**
 * 记录用户行为
 * POST /api/ui/behavior
 */
router.post('/behavior', async (req, res) => {
  try {
    const {
      applicationId,
      actions,
      context,
      userId,
      sessionId
    } = req.body;

    await memorySystem.recordUserBehavior(
      applicationId,
      actions,
      {
        userId,
        sessionId,
        startTime: new Date(context.startTime),
        endTime: new Date(context.endTime)
      }
    );

    res.json({
      success: true,
      recorded_actions: actions.length,
      learning_updated: true
    });

  } catch (error) {
    console.error('Behavior recording failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Behavior recording failed'
    });
  }
});

/**
 * 获取应用记忆
 * GET /api/ui/memory/:applicationId
 */
router.get('/memory/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;

    const stats = memorySystem.getApplicationStats(applicationId);
    const suggestions = await memorySystem.getLearningSuggestions(applicationId);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Application not found in memory'
      });
    }

    res.json({
      success: true,
      application_id: applicationId,
      stats,
      suggestions,
      memory_available: true
    });

  } catch (error) {
    console.error('Memory retrieval failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Memory retrieval failed'
    });
  }
});

/**
 * 搜索记忆
 * POST /api/ui/memory/search
 */
router.post('/memory/search', async (req, res) => {
  try {
    const query = req.body;

    const results = await memorySystem.searchMemory(query);

    res.json({
      success: true,
      results: {
        applications: results.applications.map(app => ({
          id: app.application_id,
          name: app.application_name,
          type: app.application_type,
          platform: app.platform,
          confidence: app.confidence_score,
          last_accessed: app.last_accessed,
          structures_count: app.ui_structures.length
        })),
        structures: results.structures.map(structure => ({
          id: structure.id,
          type: structure.structure_type,
          confidence: structure.stability_score,
          occurrence_count: structure.occurrence_count
        })),
        patterns: results.patterns.map(pattern => ({
          id: pattern.id,
          name: pattern.pattern_name,
          type: pattern.pattern_type,
          reliability: pattern.reliability_score
        }))
      },
      relevance_score: results.relevance_score,
      total_results: results.total_results,
      search_time: results.search_time
    });

  } catch (error) {
    console.error('Memory search failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Memory search failed'
    });
  }
});

// 辅助函数

async function buildIntelligentAnalysis(
  applicationId: string,
  elements: any[],
  uiStructure: any,
  analysisLevel: string,
  context?: any
): Promise<any> {
  // 构建容器
  const containers = await containerBuilder.buildContainers(elements, uiStructure);

  // 构建控件
  const controls = await controlBuilder.buildControls(elements, containers);

  // 分析页面类型
  const pageType = inferPageType(elements, containers, context);

  // 分析用户意图
  const userIntent = inferUserIntent(context?.userIntent, pageType, elements);

  // 生成用户流程
  const userFlows = generateUserFlows(pageType, containers, controls);

  return {
    pageType,
    userIntent,
    completionProbability: calculateCompletionProbability(elements, containers),
    estimatedTime: estimateTaskTime(userFlows),
    difficultyLevel: assessDifficulty(elements, containers),
    accessibilityScore: calculateAccessibilityScore(elements),
    containers,
    controls,
    userFlows
  };
}

function inferApplicationId(pageUrl?: string): string {
  if (!pageUrl) return 'unknown-app';

  try {
    const url = new URL(pageUrl);
    return url.hostname.replace('www.', '');
  } catch {
    return 'unknown-app';
  }
}

function inferApplicationType(elements: any[], context?: any): string {
  // 基于元素类型和上下文推断应用类型
  if (context?.pageUrl?.includes('github.com')) return 'webapp';
  if (context?.pageUrl?.includes('weibo.com')) return 'social_media';
  if (context?.pageUrl?.includes('taobao.com')) return 'ecommerce';

  const hasFormElements = elements.some(e =>
    ['input', 'textarea', 'select', 'button'].includes(e.type)
  );

  return hasFormElements ? 'webapp' : 'website';
}

function inferPlatform(elements: any[], context?: any): string {
  if (context?.userAgent?.includes('Mobile')) return 'mobile';
  if (context?.userAgent?.includes('Android')) return 'android';
  if (context?.userAgent?.includes('iPhone')) return 'ios';
  return 'web';
}

function extractAppName(applicationId: string): string {
  return applicationId.split('.')[0] || applicationId;
}

function inferPageType(elements: any[], containers: any[], context?: any): string {
  // 推断页面类型
  if (context?.pageTitle?.includes('登录') || context?.pageUrl?.includes('login')) {
    return 'login_page';
  }

  const hasSearchInput = elements.some(e => e.type === 'search');
  if (hasSearchInput) return 'search_page';

  const hasFormElements = containers.some(c => c.type === 'form');
  if (hasFormElements) return 'form_page';

  return 'content_page';
}

function inferUserIntent(userIntent?: string, pageType?: string, elements?: any[]): string {
  if (userIntent) return userIntent;

  switch (pageType) {
    case 'login_page': return 'user_authentication';
    case 'search_page': return 'information_search';
    case 'form_page': return 'data_entry';
    default: return 'content_browsing';
  }
}

function generateUserFlows(pageType: string, containers: any[], controls: any[]): any[] {
  // 生成用户流程
  switch (pageType) {
    case 'login_page':
      return [
        {
          name: '用户登录流程',
          description: '用户输入凭据并完成登录',
          steps: [
            { order: 1, action: '输入用户名', target: 'username-input', optional: false },
            { order: 2, action: '输入密码', target: 'password-input', optional: false },
            { order: 3, action: '点击登录', target: 'login-button', optional: false }
          ],
          successRate: 0.85,
          estimatedTime: 15000,
          confidence: 0.9
        }
      ];
    default:
      return [];
  }
}

function calculateCompletionProbability(elements: any[], containers: any[]): number {
  // 计算完成概率
  const interactiveElements = elements.filter(e =>
    ['button', 'input', 'select', 'link'].includes(e.type)
  );

  if (interactiveElements.length === 0) return 0.5;
  if (interactiveElements.length <= 3) return 0.9;
  if (interactiveElements.length <= 10) return 0.8;
  return 0.6;
}

function estimateTaskTime(userFlows: any[]): number {
  // 估算任务时间（毫秒）
  if (userFlows.length === 0) return 10000;

  const totalTime = userFlows.reduce((sum, flow) => sum + flow.estimatedTime, 0);
  return totalTime / userFlows.length;
}

function assessDifficulty(elements: any[], containers: any[]): 'easy' | 'medium' | 'hard' {
  // 评估难度
  const complexity = elements.length + containers.length * 2;

  if (complexity <= 10) return 'easy';
  if (complexity <= 30) return 'medium';
  return 'hard';
}

function calculateAccessibilityScore(elements: any[]): number {
  // 计算可访问性得分
  let score = 0.5;

  // 检查是否有标签
  const elementsWithLabels = elements.filter(e => e.text || e.description);
  score += (elementsWithLabels.length / elements.length) * 0.3;

  // 检查表单元素
  const formElements = elements.filter(e => ['input', 'select', 'textarea'].includes(e.type));
  score += formElements.length > 0 ? 0.2 : 0;

  return Math.min(1, score);
}

async function generateIntelligentSuggestions(
  applicationId: string,
  pageAnalysis: any,
  context?: any
): Promise<any[]> {
  const suggestions: any[] = [];

  // 基于页面类型的建议
  switch (pageAnalysis.pageType) {
    case 'login_page':
      suggestions.push({
        type: 'auto-fill',
        title: '自动填充登录信息',
        description: '基于已保存的用户凭据自动填充登录表单',
        confidence: 0.9,
        steps: [
          { order: 1, action: '识别用户名输入框', target: 'username-field' },
          { order: 2, action: '填充用户名', target: 'username-field' },
          { order: 3, action: '识别密码输入框', target: 'password-field' },
          { order: 4, action: '填充密码', target: 'password-field' },
          { order: 5, action: '点击登录按钮', target: 'login-button' }
        ],
        prerequisites: ['已保存用户凭据'],
        expected_outcome: '成功登录系统',
        risk_level: 'low'
      });
      break;

    case 'search_page':
      suggestions.push({
        type: 'smart-search',
        title: '智能搜索建议',
        description: '基于历史搜索提供智能建议',
        confidence: 0.8,
        steps: [
          { order: 1, action: '分析搜索历史', target: 'search-history' },
          { order: 2, action: '提供搜索建议', target: 'search-suggestions' },
          { order: 3, action: '执行搜索', target: 'search-button' }
        ],
        prerequisites: ['有搜索历史数据'],
        expected_outcome: '提高搜索效率',
        risk_level: 'low'
      });
      break;
  }

  // 基于用户意图的建议
  if (context?.userIntent === 'user_authentication' && pageAnalysis.completionProbability > 0.8) {
    suggestions.push({
      type: 'quick-login',
      title: '快速登录',
      description: '使用记住的凭据快速登录',
      confidence: 0.95,
      steps: [
        { order: 1, action: '验证已保存凭据', target: 'credential-store' },
        { order: 2, action: '自动填充表单', target: 'login-form' },
        { order: 3, action: '提交登录', target: 'submit-button' }
      ],
      prerequisites: ['已保存登录凭据'],
      expected_outcome: '快速完成登录',
      risk_level: 'low'
    });
  }

  // 添加学习系统的建议
  const memorySuggestions = await memorySystem.getLearningSuggestions(applicationId);
  suggestions.push(...memorySuggestions.map(suggestion => ({
    type: 'learning-improvement',
    title: '系统学习建议',
    description: suggestion,
    confidence: 0.7,
    steps: [],
    prerequisites: [],
    expected_outcome: '提升系统智能程度',
    risk_level: 'low'
  })));

  return suggestions;
}

async function detectChanges(applicationId: string, newElements: any[]): Promise<any[]> {
  // 检测UI变化
  const existingStructure = await memorySystem.findMatchingStructure(applicationId, newElements, 0.9);

  if (!existingStructure) {
    return [{
      type: 'new-structure',
      elementId: 'page',
      description: '检测到新的页面结构'
    }];
  }

  const changes: any[] = [];

  // 这里可以实现更复杂的变化检测逻辑
  // 目前返回空数组，表示没有检测到变化

  return changes;
}

export default router;