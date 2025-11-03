/**
 * 高层UI容器系统 - 容器管理API路由
 * 提供容器的创建、管理、分析等操作接口
 */

import { Router } from 'express';
import { ContainerBuilder } from '../../core/container-builder';
import { AnnotationManagerService } from '../../services/annotation-manager';
import { MemorySystem } from '../../services/memory-system';
import { RecognitionServiceClient } from '../../services/recognition-client';

const router = Router();

// 创建服务实例
const containerBuilder = new ContainerBuilder(new AnnotationManagerService());
const annotationManager = new AnnotationManagerService();
const memorySystem = new MemorySystem();
const recognitionClient = new RecognitionServiceClient();

/**
 * 智能容器分析
 * POST /api/container/analyze
 */
router.post('/analyze', async (req, res) => {
  try {
    const {
      image,
      applicationId,
      analysisOptions = {},
      buildOptions = {}
    } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'Image is required'
      });
    }

    // 第一步：调用底层识别服务获取元素
    const elements = await recognitionClient.recognizeElements(
      image,
      analysisOptions.userIntent || '分析页面容器结构'
    );

    // 第二步：从记忆系统获取应用上下文
    const existingStructure = await memorySystem.findMatchingStructure(
      applicationId,
      elements,
      buildOptions.quality_threshold || 0.7
    );

    // 第三步：构建容器系统
    const containerResult = await containerBuilder.buildContainers({
      elements,
      uiStructure: existingStructure,
      applicationId,
      buildOptions: {
        auto_create_root: true,
        enable_nesting: true,
        enable_anchor_relationships: true,
        enable_auto_annotation: true,
        quality_threshold: buildOptions.quality_threshold || 0.7,
        max_nesting_depth: buildOptions.max_nesting_depth || 10,
        ...buildOptions
      }
    });

    // 第四步：记录到记忆系统
    if (containerResult.containers.length > 0) {
      await memorySystem.recordUIStructure(
        applicationId,
        'webapp',
        'web',
        elements,
        {
          analysis_timestamp: new Date(),
          container_count: containerResult.containers.length,
          hierarchy_depth: containerResult.hierarchy.hierarchy_depth,
          quality_score: containerResult.quality_metrics.overall_score
        }
      );
    }

    res.json({
      success: true,
      application_id: applicationId,
      container_analysis: {
        // 容器统计
        total_containers: containerResult.containers.length,
        root_containers: containerResult.root_containers.length,
        hierarchy_depth: containerResult.hierarchy.hierarchy_depth,
        max_depth: containerResult.build_stats.max_depth,
        avg_depth: containerResult.build_stats.avg_depth,

        // 容器列表
        containers: containerResult.containers.map(container => ({
          id: container.id,
          type: container.type,
          name: container.properties.name || container.type,
          bounds: container.bounds,
          depth: container.metadata.depth || 1,
          children_count: container.children?.length || 0,
          quality_score: container.metadata.confidence || 0.8,
          purpose: container.properties.purpose || 'UI容器',
          suggested_actions: container.properties.suggested_actions || []
        })),

        // 层级结构
        hierarchy: {
          tree_structure: containerResult.hierarchy.tree_structure.map(node => ({
            id: node.annotation.id,
            name: node.annotation.container_name,
            type: node.annotation.container_type,
            depth: node.depth,
            path: node.path,
            children_count: node.children.length
          })),
          root_containers: containerResult.hierarchy.root_containers.map(root => ({
            id: root.id,
            name: root.container_name,
            type: root.container_type,
            bounds: root.bounds,
            quality_score: root.quality_score
          }))
        },

        // 质量指标
        quality_metrics: containerResult.quality_metrics,
        build_stats: containerResult.build_stats,

        // 标注信息
        annotations_count: containerResult.annotations.length,
        anchor_relationships: containerResult.build_stats.anchor_relationships
      },

      // 识别的元素信息
      elements_summary: {
        total_elements: elements.length,
        assigned_elements: containerResult.build_stats.assigned_elements,
        unassigned_elements: containerResult.build_stats.unassigned_elements,
        assignment_rate: containerResult.build_stats.assignment_rate
      },

      // 记忆信息
      memory_info: {
        existing_structure_found: !!existingStructure,
        structure_saved: true,
        learning_ready: true
      },

      processing_time: Date.now(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Container analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Container analysis failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 获取容器详情
 * GET /api/container/:containerId
 */
router.get('/:containerId', async (req, res) => {
  try {
    const { containerId } = req.params;
    const { include_children = true, include_controls = true } = req.query;

    // 从标注系统获取容器信息
    const annotation = annotationManager.getAnnotation(containerId);
    if (!annotation) {
      return res.status(404).json({
        success: false,
        error: 'Container not found'
      });
    }

    // 获取子容器
    let childContainers = [];
    if (include_children === 'true') {
      for (const childId of annotation.child_annotation_ids) {
        const childAnnotation = annotationManager.getAnnotation(childId);
        if (childAnnotation) {
          childContainers.push({
            id: childAnnotation.id,
            name: childAnnotation.container_name,
            type: childAnnotation.container_type,
            bounds: childAnnotation.bounds,
            depth: childAnnotation.sequence_number,
            quality_score: childAnnotation.quality_score
          });
        }
      }
    }

    res.json({
      success: true,
      container: {
        id: annotation.id,
        name: annotation.container_name,
        type: annotation.container_type,
        bounds: annotation.bounds,
        is_root: annotation.is_root_container,
        depth: annotation.sequence_number,
        level: annotation.annotation_level,

        // 位置信息
        position: {
          absolute: annotation.bounds,
          relative: annotation.relative_position
        },

        // 锚点信息
        anchor_info: annotation.anchor_element_id ? {
          element_id: annotation.anchor_element_id,
          element_type: annotation.anchor_element_type,
          relationship: annotation.anchor_relationship
        } : null,

        // 层级关系
        hierarchy: {
          parent_id: annotation.parent_annotation_id,
          parent_sequence: annotation.parent_sequence_number,
          children: childContainers,
          path: `${annotation.parent_sequence_number || 0}.${annotation.sequence_number}`
        },

        // 内容分析
        content: {
          title: annotation.annotation_content.title,
          description: annotation.annotation_content.description,
          purpose: annotation.annotation_content.purpose,
          primary_function: annotation.annotation_content.primary_function,
          user_intent: annotation.annotation_content.user_intent,
          content_summary: annotation.annotation_content.content_summary
        },

        // 质量信息
        quality: {
          validation_status: annotation.validation_status,
          quality_score: annotation.quality_score,
          confidence_score: annotation.confidence_score,
          created_by: annotation.created_by,
          created_at: annotation.created_at
        },

        // 特征信息
        features: {
          visual: annotation.visual_features,
          structural: annotation.structural_features
        },

        // 标签和属性
        tags: annotation.tags,
        custom_properties: annotation.custom_properties
      }
    });

  } catch (error) {
    console.error('Get container failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get container failed'
    });
  }
});

/**
 * 获取容器的控件列表
 * GET /api/container/:containerId/controls
 */
router.get('/:containerId/controls', async (req, res) => {
  try {
    const { containerId } = req.params;
    const { include_operations = true } = req.query;

    // 这里需要从控件构建器或数据库获取控件信息
    // 简化实现，返回示例数据
    const controls = [
      {
        id: 'control-1',
        type: 'input',
        name: '用户名输入框',
        bounds: { x1: 100, y1: 50, x2: 300, y2: 80 },
        properties: {
          label: '用户名',
          input_type: 'text',
          required: true,
          placeholder: '请输入用户名'
        },
        operations: include_operations === 'true' ? [
          { id: 'op-1', name: 'type', display_name: '输入文本', risk_level: 'medium' },
          { id: 'op-2', name: 'clear', display_name: '清空', risk_level: 'low' }
        ] : [],
        quality_score: 0.9
      }
    ];

    res.json({
      success: true,
      container_id: containerId,
      controls,
      total_controls: controls.length
    });

  } catch (error) {
    console.error('Get container controls failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get container controls failed'
    });
  }
});

/**
 * 执行容器操作
 * POST /api/container/:containerId/execute
 */
router.post('/:containerId/execute', async (req, res) => {
  try {
    const { containerId } = req.params;
    const { operation, parameters = {}, options = {} } = req.body;

    if (!operation) {
      return res.status(400).json({
        success: false,
        error: 'Operation is required'
      });
    }

    // 验证容器存在
    const annotation = annotationManager.getAnnotation(containerId);
    if (!annotation) {
      return res.status(404).json({
        success: false,
        error: 'Container not found'
      });
    }

    // 执行容器操作
    const result = await executeContainerOperation(containerId, operation, parameters, options);

    res.json({
      success: true,
      operation,
      result,
      container_id: containerId,
      execution_time: Date.now(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Execute container operation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Execute container operation failed'
    });
  }
});

/**
 * 创建子容器
 * POST /api/container/:parentId/create-child
 */
router.post('/:parentId/create-child', async (req, res) => {
  try {
    const { parentId } = req.params;
    const {
      name,
      type,
      bounds,
      anchorElementId,
      properties = {}
    } = req.body;

    if (!name || !type || !bounds) {
      return res.status(400).json({
        success: false,
        error: 'Name, type, and bounds are required'
      });
    }

    // 验证父容器存在
    const parentAnnotation = annotationManager.getAnnotation(parentId);
    if (!parentAnnotation) {
      return res.status(404).json({
        success: false,
        error: 'Parent container not found'
      });
    }

    // 创建子容器
    const childAnnotation = await annotationManager.createChildContainer(
      parentId,
      bounds,
      anchorElementId
    );

    // 更新子容器属性
    if (properties || name !== childAnnotation.container_name) {
      await annotationManager.updateAnnotation(childAnnotation.id, {
        container_name: name,
        annotation_content: {
          ...childAnnotation.annotation_content,
          title: name,
          description: properties.description || `${name}容器`,
          ...properties
        }
      });
    }

    res.json({
      success: true,
      child_container: {
        id: childAnnotation.id,
        name: name,
        type: type,
        bounds: childAnnotation.bounds,
        parent_id: parentId,
        anchor_element_id: anchorElementId,
        depth: childAnnotation.sequence_number,
        quality_score: childAnnotation.quality_score
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Create child container failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Create child container failed'
    });
  }
});

/**
 * 更新容器
 * PUT /api/container/:containerId
 */
router.put('/:containerId', async (req, res) => {
  try {
    const { containerId } = req.params;
    const updates = req.body;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No updates provided'
      });
    }

    // 验证容器存在
    const annotation = annotationManager.getAnnotation(containerId);
    if (!annotation) {
      return res.status(404).json({
        success: false,
        error: 'Container not found'
      });
    }

    // 更新容器
    const success = await annotationManager.updateAnnotation(containerId, updates);

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update container'
      });
    }

    // 获取更新后的容器信息
    const updatedAnnotation = annotationManager.getAnnotation(containerId);

    res.json({
      success: true,
      container: {
        id: updatedAnnotation!.id,
        name: updatedAnnotation!.container_name,
        type: updatedAnnotation!.container_type,
        bounds: updatedAnnotation!.bounds,
        quality_score: updatedAnnotation!.quality_score,
        updated_at: new Date()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Update container failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Update container failed'
    });
  }
});

/**
 * 删除容器
 * DELETE /api/container/:containerId
 */
router.delete('/:containerId', async (req, res) => {
  try {
    const { containerId } = req.params;
    const { force = false } = req.query;

    // 验证容器存在
    const annotation = annotationManager.getAnnotation(containerId);
    if (!annotation) {
      return res.status(404).json({
        success: false,
        error: 'Container not found'
      });
    }

    // 检查是否有子容器
    if (annotation.child_annotation_ids.length > 0 && force !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete container with children. Use force=true to override.',
        child_count: annotation.child_annotation_ids.length
      });
    }

    // 删除容器
    const success = await annotationManager.deleteAnnotation(containerId);

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete container'
      });
    }

    res.json({
      success: true,
      deleted_container_id: containerId,
      message: 'Container deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Delete container failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Delete container failed'
    });
  }
});

/**
 * 搜索容器
 * POST /api/container/search
 */
router.post('/search', async (req, res) => {
  try {
    const query = req.body;

    // 搜索容器
    const annotations = await annotationManager.searchAnnotations({
      annotation_type: query.annotation_type,
      annotation_level: query.annotation_level,
      container_type: query.container_type,
      tags: query.tags,
      parent_id: query.parent_id,
      quality_score_min: query.quality_score_min,
      confidence_score_min: query.confidence_score_min,
      created_after: query.created_after ? new Date(query.created_after) : undefined,
      created_before: query.created_before ? new Date(query.created_before) : undefined
    });

    const containers = annotations.map(annotation => ({
      id: annotation.id,
      name: annotation.container_name,
      type: annotation.container_type,
      bounds: annotation.bounds,
      depth: annotation.sequence_number,
      quality_score: annotation.quality_score,
      confidence_score: annotation.confidence_score,
      tags: annotation.tags,
      created_at: annotation.created_at
    }));

    res.json({
      success: true,
      containers,
      total_results: containers.length,
      query,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search containers failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search containers failed'
    });
  }
});

/**
 * 获取容器层级结构
 * GET /api/container/:containerId/hierarchy
 */
router.get('/:containerId/hierarchy', async (req, res) => {
  try {
    const { containerId } = req.params;
    const { max_depth = 10 } = req.query;

    // 获取容器及其子容器的完整层级结构
    const buildResult = await containerBuilder.buildContainerHierarchy(
      Array.from(annotationManager['annotations'].values())
    );

    // 找到指定容器的子树
    const subtree = findContainerSubtree(containerId, buildResult.tree_structure, parseInt(max_depth as string));

    if (!subtree) {
      return res.status(404).json({
        success: false,
        error: 'Container hierarchy not found'
      });
    }

    res.json({
      success: true,
      container_id: containerId,
      hierarchy: {
        root: subtree.annotation,
        tree: subtree.children,
        depth: calculateSubtreeDepth(subtree),
        total_containers: countSubtreeContainers(subtree)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get container hierarchy failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get container hierarchy failed'
    });
  }
});

// 辅助函数

async function executeContainerOperation(
  containerId: string,
  operation: string,
  parameters: any,
  options: any
): Promise<any> {
  switch (operation) {
    case 'scroll_to_view':
      return { success: true, action: 'scrolled_to_view', parameters };
    case 'expand':
      return { success: true, action: 'expanded', parameters };
    case 'collapse':
      return { success: true, action: 'collapsed', parameters };
    case 'highlight':
      return { success: true, action: 'highlighted', parameters };
    case 'analyze_content':
      return { success: true, action: 'content_analyzed', result: { content_type: 'mixed', elements: 5 } };
    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }
}

function findContainerSubtree(containerId: string, treeStructure: any[], maxDepth: number): any {
  for (const node of treeStructure) {
    if (node.annotation.id === containerId) {
      return limitTreeDepth(node, maxDepth);
    }
    const found = findContainerSubtree(containerId, node.children, maxDepth);
    if (found) return found;
  }
  return null;
}

function limitTreeDepth(node: any, maxDepth: number): any {
  if (maxDepth <= 0) {
    return { ...node, children: [] };
  }
  return {
    ...node,
    children: node.children.map(child => limitTreeDepth(child, maxDepth - 1))
  };
}

function calculateSubtreeDepth(subtree: any): number {
  if (subtree.children.length === 0) return 1;
  return 1 + Math.max(...subtree.children.map(child => calculateSubtreeDepth(child)));
}

function countSubtreeContainers(subtree: any): number {
  return 1 + subtree.children.reduce((sum: number, child: any) => sum + countSubtreeContainers(child), 0);
}

export default router;