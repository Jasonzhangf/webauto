/**
 * 高层UI容器系统 - 控件操作API路由
 * 提供控件的执行、管理、自动化等操作接口
 */

import { Router } from 'express';
import { ControlBuilder } from '../../core/control-builder';
import { AnnotationManagerService } from '../../services/annotation-manager';
import { RecognitionServiceClient } from '../../services/recognition-client';
import { OperationEngine } from '../../core/operation-engine';

const router = Router();

// 创建服务实例
const controlBuilder = new ControlBuilder();
const annotationManager = new AnnotationManagerService();
const recognitionClient = new RecognitionServiceClient();
const operationEngine = new OperationEngine();

/**
 * 智能控件识别和构建
 * POST /api/control/build
 */
router.post('/build', async (req, res) => {
  try {
    const {
      image,
      containerId,
      applicationId,
      buildOptions = {}
    } = req.body;

    if (!image || !containerId) {
      return res.status(400).json({
        success: false,
        error: 'Image and containerId are required'
      });
    }

    // 第一步：验证容器存在
    const containerAnnotation = annotationManager.getAnnotation(containerId);
    if (!containerAnnotation) {
      return res.status(404).json({
        success: false,
        error: 'Container not found'
      });
    }

    // 第二步：识别容器内的元素
    const containerBounds = containerAnnotation.bounds;
    const elements = await recognitionClient.recognizeElements(
      image,
      `识别容器内的UI元素，容器边界: ${JSON.stringify(containerBounds)}`
    );

    // 第三步：过滤容器内的元素
    const containerElements = elements.filter(element =>
      element.bbox.x1 >= containerBounds.x1 &&
      element.bbox.y1 >= containerBounds.y1 &&
      element.bbox.x2 <= containerBounds.x2 &&
      element.bbox.y2 <= containerBounds.y2
    );

    // 第四步：构建控件
    const controlResult = await controlBuilder.buildControls({
      elements: containerElements,
      containers: [convertAnnotationToContainer(containerAnnotation)],
      annotations: [containerAnnotation],
      buildOptions: {
        enable_smart_detection: true,
        enable_interaction_prediction: true,
        enable_auto_operations: true,
        quality_threshold: buildOptions.quality_threshold || 0.7,
        prefer_semantic_detection: true,
        enable_contextual_analysis: true,
        ...buildOptions
      }
    });

    // 第五步：建立控件与容器的关联
    const containerControls = controlResult.container_controls[containerId] || [];

    res.json({
      success: true,
      container_id: containerId,
      application_id: applicationId,
      control_build_result: {
        // 控件统计
        total_controls: controlResult.controls.length,
        container_controls: containerControls.length,
        unassigned_elements: controlResult.unassigned_elements.length,
        assignment_rate: controlResult.build_stats.assignment_rate,

        // 控件分类统计
        controls_by_type: controlResult.build_stats.controls_by_type,

        // 控件列表
        controls: containerControls.map(control => ({
          id: control.id,
          type: control.type,
          name: control.properties.label || `${control.type}_${control.id.slice(-4)}`,
          bounds: control.bounds,
          container_id: control.container,

          // 控件属性
          properties: {
            label: control.properties.label,
            placeholder: control.properties.placeholder,
            required: control.properties.required,
            enabled: control.properties.enabled,
            visible: control.properties.visible,
            editable: control.properties.editable,
            accessibility_label: control.properties.accessibility_label
          },

          // 可用操作
          available_operations: control.operations.map(op => ({
            id: op.id,
            name: op.name,
            display_name: op.display_name,
            description: op.description,
            risk_level: op.risk_level,
            estimated_time: op.estimated_time,
            required_parameters: op.required_parameters,
            optional_parameters: op.optional_parameters
          })),

          // 质量信息
          quality: {
            confidence: control.metadata.confidence,
            detection_method: control.metadata.detection_method,
            source_elements: control.metadata.source_elements,
            tags: control.metadata.tags
          }
        })),

        // 质量指标
        quality_metrics: controlResult.quality_metrics,
        build_stats: controlResult.build_stats,

        // 未分配的元素
        unassigned_elements: controlResult.unassigned_elements.map(element => ({
          id: element.id,
          type: element.type,
          text: element.text,
          bounds: element.bbox,
          confidence: element.confidence,
          reason: 'unassigned_element'
        }))
      },

      processing_time: Date.now(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Control build failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Control build failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 执行控件操作
 * POST /api/control/:controlId/execute
 */
router.post('/:controlId/execute', async (req, res) => {
  try {
    const { controlId } = req.params;
    const {
      operation,
      parameters = {},
      options = {}
    } = req.body;

    if (!operation) {
      return res.status(400).json({
        success: false,
        error: 'Operation is required'
      });
    }

    // 这里需要从数据库或缓存中获取控件信息
    // 简化实现，直接执行操作
    const result = await operationEngine.executeControlOperation(
      { id: controlId } as any, // 简化的控件对象
      {
        id: operation,
        name: operation,
        display_name: operation,
        description: `执行${operation}操作`,
        parameters,
        required_parameters: [],
        optional_parameters: [],
        return_type: 'boolean',
        risk_level: 'medium',
        estimated_time: 200
      },
      parameters
    );

    res.json({
      success: true,
      control_id: controlId,
      operation,
      result,
      execution_time: result.execution_time || Date.now(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Execute control operation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Execute control operation failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 智能操作 - 基于意图执行操作
 * POST /api/control/smart-execute
 */
router.post('/smart-execute', async (req, res) => {
  try {
    const {
      intent,
      context,
      targetContainerId,
      options = {}
    } = req.body;

    if (!intent) {
      return res.status(400).json({
        success: false,
        error: 'Intent is required'
      });
    }

    // 基于意图分析需要的操作序列
    const operationPlan = await analyzeIntentAndCreateOperationPlan(intent, context, targetContainerId);

    // 执行操作序列
    const results = [];
    for (const step of operationPlan.steps) {
      try {
        const result = await operationEngine.executeControlOperation(
          step.control,
          step.operation,
          step.parameters
        );
        results.push({
          step: step.step_number,
          operation: step.operation.name,
          success: result.success,
          result: result.data,
          execution_time: result.execution_time
        });
      } catch (error) {
        results.push({
          step: step.step_number,
          operation: step.operation.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          execution_time: 0
        });
        break; // 如果某步失败，停止执行
      }
    }

    const overallSuccess = results.every(r => r.success);

    res.json({
      success: overallSuccess,
      intent,
      context,
      operation_plan: {
        description: operationPlan.description,
        estimated_time: operationPlan.estimated_time,
        confidence: operationPlan.confidence,
        steps_count: operationPlan.steps.length
      },
      execution_results: results,
      summary: {
        total_steps: operationPlan.steps.length,
        successful_steps: results.filter(r => r.success).length,
        failed_steps: results.filter(r => !r.success).length,
        overall_success: overallSuccess,
        total_execution_time: results.reduce((sum, r) => sum + r.execution_time, 0)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Smart execute failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Smart execute failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 批量执行控件操作
 * POST /api/control/batch-execute
 */
router.post('/batch-execute', async (req, res) => {
  try {
    const { operations = [], options = {} } = req.body;

    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Operations array is required'
      });
    }

    const results = [];
    const startTime = Date.now();

    for (let i = 0; i < operations.length; i++) {
      const { controlId, operation, parameters = {} } = operations[i];

      try {
        const result = await operationEngine.executeControlOperation(
          { id: controlId } as any,
          {
            id: operation,
            name: operation,
            parameters,
            required_parameters: [],
            optional_parameters: [],
            return_type: 'boolean',
            risk_level: 'medium'
          },
          parameters
        );

        results.push({
          index: i,
          control_id: controlId,
          operation,
          success: result.success,
          result: result.data,
          execution_time: result.execution_time,
          error: null
        });

      } catch (error) {
        results.push({
          index: i,
          control_id: controlId,
          operation,
          success: false,
          result: null,
          execution_time: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      batch_results: {
        total_operations: operations.length,
        successful_operations: successCount,
        failed_operations: operations.length - successCount,
        success_rate: successCount / operations.length,
        total_execution_time: totalTime,
        average_execution_time: totalTime / operations.length
      },
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Batch execute failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Batch execute failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 获取控件详情
 * GET /api/control/:controlId
 */
router.get('/:controlId', async (req, res) => {
  try {
    const { controlId } = req.params;
    const { include_operations = true } = req.query;

    // 这里需要从数据库获取控件信息
    // 简化实现，返回示例数据
    const control = {
      id: controlId,
      type: 'input',
      name: '用户名输入框',
      bounds: { x1: 100, y1: 50, x2: 300, y2: 80 },
      container_id: 'container-1',

      properties: {
        label: '用户名',
        placeholder: '请输入用户名',
        required: true,
        enabled: true,
        visible: true,
        editable: true,
        accessibility_label: '用户名输入框'
      },

      metadata: {
        confidence: 0.95,
        detection_method: 'smart_detection',
        source_elements: ['element-1'],
        tags: ['input', 'required', 'username']
      }
    };

    const operations = include_operations === 'true' ? [
      {
        id: 'op-type',
        name: 'type',
        display_name: '输入文本',
        description: '在输入框中输入文本',
        parameters: { text: '' },
        required_parameters: ['text'],
        optional_parameters: ['clear_first', 'delay'],
        risk_level: 'medium',
        estimated_time: 500
      },
      {
        id: 'op-clear',
        name: 'clear',
        display_name: '清空',
        description: '清空输入框内容',
        parameters: {},
        required_parameters: [],
        optional_parameters: [],
        risk_level: 'low',
        estimated_time: 50
      },
      {
        id: 'op-focus',
        name: 'focus',
        display_name: '获得焦点',
        description: '让输入框获得焦点',
        parameters: {},
        required_parameters: [],
        optional_parameters: [],
        risk_level: 'low',
        estimated_time: 50
      }
    ] : [];

    res.json({
      success: true,
      control: {
        ...control,
        operations
      }
    });

  } catch (error) {
    console.error('Get control failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get control failed'
    });
  }
});

/**
 * 搜索控件
 * POST /api/control/search
 */
router.post('/search', async (req, res) => {
  try {
    const {
      containerId,
      type,
      text,
      properties = {},
      tags = [],
      options = {}
    } = req.body;

    // 构建搜索查询
    const searchQuery = {
      container_id: containerId,
      control_type: type,
      text_contains: text,
      properties: properties,
      tags: tags,
      ...options
    };

    // 执行搜索
    const controls = await searchControls(searchQuery);

    res.json({
      success: true,
      search_query: searchQuery,
      controls,
      total_results: controls.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search controls failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search controls failed'
    });
  }
});

/**
 * 验证控件操作
 * POST /api/control/:controlId/validate
 */
router.post('/:controlId/validate', async (req, res) => {
  try {
    const { controlId } = req.params;
    const { operation, parameters = {} } = req.body;

    // 验证操作是否适用于该控件
    const validationResult = await validateControlOperation(controlId, operation, parameters);

    res.json({
      success: true,
      control_id: controlId,
      operation,
      validation_result: validationResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Validate control operation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Validate control operation failed'
    });
  }
});

/**
 * 获取控件的交互建议
 * GET /api/control/:controlId/suggestions
 */
router.get('/:controlId/suggestions', async (req, res) => {
  try {
    const { controlId } = req.params;
    const { context = {} } = req.query;

    // 基于控件类型和上下文生成交互建议
    const suggestions = await generateControlInteractionSuggestions(controlId, context);

    res.json({
      success: true,
      control_id: controlId,
      context,
      suggestions,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get control suggestions failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get control suggestions failed'
    });
  }
});

// 辅助函数

function convertAnnotationToContainer(annotation: any): any {
  return {
    id: annotation.container_id,
    type: annotation.container_type,
    bounds: annotation.bounds,
    properties: {
      name: annotation.container_name,
      purpose: annotation.annotation_content.purpose,
      description: annotation.annotation_content.description
    },
    metadata: {
      confidence: annotation.confidence_score,
      created_at: annotation.created_at
    }
  };
}

async function analyzeIntentAndCreateOperationPlan(intent: string, context: any, targetContainerId?: string): Promise<any> {
  // 简化的意图分析实现
  const intentPlans: Record<string, any> = {
    'login': {
      description: '用户登录流程',
      estimated_time: 3000,
      confidence: 0.9,
      steps: [
        {
          step_number: 1,
          control: { id: 'username-input' },
          operation: { name: 'type', parameters: { text: context.username || '' } },
          parameters: { text: context.username || '' }
        },
        {
          step_number: 2,
          control: { id: 'password-input' },
          operation: { name: 'type', parameters: { text: context.password || '' } },
          parameters: { text: context.password || '' }
        },
        {
          step_number: 3,
          control: { id: 'login-button' },
          operation: { name: 'click', parameters: {} },
          parameters: {}
        }
      ]
    },
    'search': {
      description: '搜索操作',
      estimated_time: 2000,
      confidence: 0.85,
      steps: [
        {
          step_number: 1,
          control: { id: 'search-input' },
          operation: { name: 'type', parameters: { text: context.query || '' } },
          parameters: { text: context.query || '' }
        },
        {
          step_number: 2,
          control: { id: 'search-button' },
          operation: { name: 'click', parameters: {} },
          parameters: {}
        }
      ]
    }
  };

  return intentPlans[intent] || {
    description: '通用操作流程',
    estimated_time: 1000,
    confidence: 0.5,
    steps: []
  };
}

async function searchControls(query: any): Promise<any[]> {
  // 简化的搜索实现
  return [
    {
      id: 'control-1',
      type: 'input',
      name: '用户名输入框',
      bounds: { x1: 100, y1: 50, x2: 300, y2: 80 },
      properties: { label: '用户名', required: true },
      relevance_score: 0.9
    }
  ];
}

async function validateControlOperation(controlId: string, operation: string, parameters: any): Promise<any> {
  // 简化的验证实现
  const validOperations = ['type', 'click', 'clear', 'focus'];
  const isValid = validOperations.includes(operation);

  return {
    is_valid: isValid,
    confidence: isValid ? 0.9 : 0.1,
    issues: isValid ? [] : [`不支持的操作类型: ${operation}`],
    suggestions: isValid ? [] : ['使用支持的操作类型']
  };
}

async function generateControlInteractionSuggestions(controlId: string, context: any): Promise<any[]> {
  // 简化的建议生成实现
  return [
    {
      type: 'interaction',
      title: '建议输入文本',
      description: '基于上下文，建议在此控件中输入相关文本',
      confidence: 0.8,
      parameters: { suggested_text: 'example text' }
    },
    {
      type: 'validation',
      title: '验证输入',
      description: '在输入后验证内容的有效性',
      confidence: 0.7,
      parameters: { validation_rules: ['required', 'format'] }
    }
  ];
}

export default router;