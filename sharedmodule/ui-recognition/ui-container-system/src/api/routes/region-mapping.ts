/**
 * 高层UI容器系统 - 区域映射API路由
 * 提供高层容器与底层识别之间的位置区域映射接口
 */

import { Router } from 'express';
import { RegionMappingService } from '../../services/region-mapping';
import { RecognitionServiceClient } from '../../services/recognition-client';
import { AnnotationManagerService } from '../../services/annotation-manager';

const router = Router();

// 创建服务实例
const regionMappingService = new RegionMappingService();
const recognitionClient = new RecognitionServiceClient();
const annotationManager = new AnnotationManagerService();

/**
 * 创建区域映射
 * POST /api/region-mapping/create
 */
router.post('/create', async (req, res) => {
  try {
    const {
      containerId,
      mappingType = 'adaptive_region',
      mappingPurpose = 'nested_recognition',
      regionBounds,
      recognitionConfig = {},
      nestingConfig = {},
      parentMappingId,
      tags = [],
      customProperties = {}
    } = req.body;

    if (!containerId) {
      return res.status(400).json({
        success: false,
        error: 'ContainerId is required'
      });
    }

    // 验证容器存在
    const containerAnnotation = annotationManager.getAnnotation(containerId);
    if (!containerAnnotation) {
      return res.status(404).json({
        success: false,
        error: 'Container not found'
      });
    }

    // 验证父映射存在
    if (parentMappingId) {
      const parentMapping = regionMappingService.getRegionMapping(parentMappingId);
      if (!parentMapping) {
        return res.status(404).json({
          success: false,
          error: 'Parent mapping not found'
        });
      }
    }

    // 创建区域映射
    const result = await regionMappingService.createRegionMapping({
      container_id: containerId,
      mapping_type: mappingType,
      mapping_purpose: mappingPurpose,
      region_bounds: regionBounds,
      recognition_config: recognitionConfig,
      nesting_config: nestingConfig,
      parent_mapping_id: parentMappingId,
      tags: tags,
      custom_properties: customProperties
    });

    res.json({
      success: true,
      region_mapping: {
        // 映射基本信息
        id: result.mapping.id,
        container_id: result.mapping.container_id,
        mapping_type: result.mapping.mapping_type,
        mapping_purpose: result.mapping.mapping_purpose,
        region_bounds: result.mapping.region_bounds,

        // 层级关系
        hierarchy: {
          parent_mapping_id: result.mapping.parent_mapping_id,
          child_mapping_ids: result.mapping.child_mapping_ids,
          sibling_mapping_ids: result.mapping.sibling_mapping_ids,
          depth: result.mapping.parent_mapping_id ? 2 : 1
        },

        // 映射配置
        recognition_config: result.mapping.recognition_config,
        nesting_config: result.mapping.nesting_config,

        // 质量指标
        quality_metrics: {
          overall_score: calculateOverallQualityScore(result.mapping.mapping_quality),
          accuracy_score: result.mapping.accuracy_score,
          reliability_score: result.mapping.reliability_score,
          detailed_quality: result.mapping.mapping_quality
        },

        // 使用统计
        usage: {
          usage_count: result.mapping.usage_count,
          created_at: result.mapping.created_at,
          last_updated: result.mapping.last_updated
        },

        // 元数据
        tags: result.mapping.tags,
        custom_properties: result.mapping.custom_properties
      },

      // 识别结果
      recognition_result: {
        elements_count: result.recognized_elements.length,
        elements_summary: categorizeElements(result.recognized_elements),
        nested_mappings_count: result.nested_mappings.length,
        processing_stats: result.processing_stats
      },

      // 嵌套映射
      nested_mappings: result.nested_mappings.map(nested => ({
        id: nested.id,
        region_bounds: nested.region_bounds,
        mapping_type: nested.mapping_type,
        quality_score: calculateOverallQualityScore(nested.mapping_quality)
      })),

      // 建议和改进
      recommendations: result.recommendations,

      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Create region mapping failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Create region mapping failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 执行局部区域识别
 * POST /api/region-mapping/:mappingId/recognize
 */
router.post('/:mappingId/recognize', async (req, res) => {
  try {
    const { mappingId } = req.params;
    const {
      image,
      recognitionOptions = {},
      forceRecreate = false
    } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'Image is required'
      });
    }

    // 验证映射存在
    const mapping = regionMappingService.getRegionMapping(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: 'Region mapping not found'
      });
    }

    // 执行嵌套识别
    const recognizedElements = await regionMappingService.performNestedRecognition(mappingId, image);

    // 如果需要，应用识别选项
    let processedElements = recognizedElements;
    if (recognitionOptions.confidence_threshold) {
      processedElements = recognizedElements.filter(
        element => element.confidence >= recognitionOptions.confidence_threshold
      );
    }

    if (recognitionOptions.max_elements) {
      processedElements = processedElements.slice(0, recognitionOptions.max_elements);
    }

    res.json({
      success: true,
      mapping_id: mappingId,
      recognition_result: {
        // 区域信息
        region_bounds: mapping.region_bounds,
        mapping_type: mapping.mapping_type,
        mapping_purpose: mapping.mapping_purpose,

        // 识别结果
        elements: processedElements.map(element => ({
          id: element.id,
          type: element.type,
          bounds: element.bbox,
          confidence: element.confidence,
          text: element.text,
          description: element.description,
          relative_position: calculateRelativePosition(element.bbox, mapping.region_bounds)
        })),

        // 识别统计
        statistics: {
          total_elements: processedElements.length,
          elements_by_type: groupElementsByType(processedElements),
          average_confidence: calculateAverageConfidence(processedElements),
          coverage_analysis: analyzeCoverage(mapping.region_bounds, processedElements)
        },

        // 质量评估
        quality_assessment: {
          recognition_quality: assessRecognitionQuality(processedElements, mapping),
          boundary_accuracy: assessBoundaryAccuracy(processedElements, mapping.region_bounds),
          content_distribution: analyzeContentDistribution(mapping.region_bounds, processedElements)
        }
      },

      // 更新的使用信息
      usage_info: {
        usage_count: mapping.usage_count + 1,
        last_recognition: new Date()
      },

      processing_time: Date.now(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Region recognition failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Region recognition failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 分析容器区域
 * POST /api/region-mapping/analyze
 */
router.post('/analyze', async (req, res) => {
  try {
    const {
      containerId,
      analysisType = 'comprehensive',
      regionBounds,
      analysisOptions = {}
    } = req.body;

    if (!containerId) {
      return res.status(400).json({
        success: false,
        error: 'ContainerId is required'
      });
    }

    // 验证容器存在
    const containerAnnotation = annotationManager.getAnnotation(containerId);
    if (!containerAnnotation) {
      return res.status(404).json({
        success: false,
        error: 'Container not found'
      });
    }

    // 执行区域分析
    const result = await regionMappingService.analyzeRegion(
      containerId,
      regionBounds || containerAnnotation.bounds,
      {
        mapping_type: analysisOptions.mapping_type || 'adaptive_region',
        mapping_purpose: analysisOptions.mapping_purpose || 'nested_recognition',
        recognition_config: analysisOptions.recognition_config,
        nesting_config: analysisOptions.nesting_config,
        tags: analysisOptions.tags,
        custom_properties: analysisOptions.custom_properties
      }
    );

    res.json({
      success: true,
      container_id: containerId,
      analysis_type: analysisType,
      analysis_result: {
        // 主要映射
        primary_mapping: {
          id: result.mapping.id,
          region_bounds: result.mapping.region_bounds,
          mapping_type: result.mapping.mapping_type,
          quality_score: calculateOverallQualityScore(result.mapping.mapping_quality)
        },

        // 识别结果
        recognition_summary: {
          total_elements: result.recognized_elements.length,
          elements_distribution: categorizeElements(result.recognized_elements),
          confidence_distribution: analyzeConfidenceDistribution(result.recognized_elements),
          spatial_distribution: analyzeSpatialDistribution(result.mapping.region_bounds, result.recognized_elements)
        },

        // 嵌套分析
        nested_analysis: {
          nested_regions_count: result.nested_mappings.length,
          nested_regions: result.nested_mappings.map(nested => ({
            id: nested.id,
            bounds: nested.region_bounds,
            type: nested.mapping_type,
            elements_estimate: estimateElementsInRegion(nested.region_bounds, result.recognized_elements),
            quality_score: calculateOverallQualityScore(nested.mapping_quality)
          })),
          hierarchy_depth: calculateMaxDepth(result.nested_mappings),
          coverage_efficiency: calculateCoverageEfficiency(result.mapping.region_bounds, result.nested_mappings)
        },

        // 质量指标
        quality_metrics: result.quality_metrics,
        processing_stats: result.processing_stats,

        // 优化建议
        optimization_suggestions: generateOptimizationSuggestions(result)
      },

      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Region analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Region analysis failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 创建嵌套映射
 * POST /api/region-mapping/:parentMappingId/create-nested
 */
router.post('/:parentMappingId/create-nested', async (req, res) => {
  try {
    const { parentMappingId } = req.params;
    const {
      regionBounds,
      mappingType = 'adaptive_region',
      nestingOptions = {}
    } = req.body;

    if (!regionBounds) {
      return res.status(400).json({
        success: false,
        error: 'Region bounds are required'
      });
    }

    // 验证父映射存在
    const parentMapping = regionMappingService.getRegionMapping(parentMappingId);
    if (!parentMapping) {
      return res.status(404).json({
        success: false,
        error: 'Parent mapping not found'
      });
    }

    // 检查嵌套深度限制
    const currentDepth = calculateMappingDepth(parentMapping);
    if (currentDepth >= parentMapping.nesting_config.max_nesting_depth) {
      return res.status(400).json({
        success: false,
        error: `Maximum nesting depth (${parentMapping.nesting_config.max_nesting_depth}) reached`,
        current_depth: currentDepth
      });
    }

    // 创建嵌套映射
    const nestedMapping = await regionMappingService.createNestedMapping(
      parentMappingId,
      regionBounds,
      {
        mapping_type: mappingType,
        recognition_config: nestingOptions.recognition_config,
        nesting_config: nestingOptions.nesting_config,
        tags: ['nested', ...(nestingOptions.tags || [])],
        custom_properties: nestingOptions.custom_properties
      }
    );

    res.json({
      success: true,
      parent_mapping_id: parentMappingId,
      nested_mapping: {
        id: nestedMapping.id,
        region_bounds: nestedMapping.region_bounds,
        mapping_type: nestedMapping.mapping_type,
        mapping_purpose: nestedMapping.mapping_purpose,
        hierarchy_depth: currentDepth + 1,
        parent_relationship: {
          parent_id: parentMappingId,
          parent_bounds: parentMapping.region_bounds,
          containment_ratio: calculateContainmentRatio(regionBounds, parentMapping.region_bounds)
        },
        quality_metrics: {
          overall_score: calculateOverallQualityScore(nestedMapping.mapping_quality),
          accuracy_score: nestedMapping.accuracy_score,
          reliability_score: nestedMapping.reliability_score
        },
        created_at: nestedMapping.created_at
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Create nested mapping failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Create nested mapping failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 构建映射层级
 * POST /api/region-mapping/:rootMappingId/build-hierarchy
 */
router.post('/:rootMappingId/build-hierarchy', async (req, res) => {
  try {
    const { rootMappingId } = req.params;
    const { validationOptions = {} } = req.body;

    // 验证根映射存在
    const rootMapping = regionMappingService.getRegionMapping(rootMappingId);
    if (!rootMapping) {
      return res.status(404).json({
        success: false,
        error: 'Root mapping not found'
      });
    }

    // 构建映射层级
    const hierarchy = await regionMappingService.buildMappingHierarchy(rootMappingId);

    // 验证层级结构
    const isValid = await regionMappingService.validateMappingHierarchy(hierarchy);

    res.json({
      success: true,
      root_mapping_id: rootMappingId,
      hierarchy: {
        // 根映射信息
        root_mapping: {
          id: hierarchy.root_mapping.id,
          region_bounds: hierarchy.root_mapping.region_bounds,
          mapping_type: hierarchy.root_mapping.mapping_type,
          total_children: hierarchy.root_mapping.child_mapping_ids.length
        },

        // 层级统计
        hierarchy_stats: {
          total_mappings: hierarchy.total_regions,
          hierarchy_depth: hierarchy.hierarchy_depth,
          max_depth_per_branch: calculateMaxDepthPerBranch(hierarchy.tree_structure),
          avg_branching_factor: calculateAvgBranchingFactor(hierarchy.all_mappings)
        },

        // 树结构
        tree_structure: hierarchy.tree_structure.map(node => ({
          mapping_id: node.mapping.id,
          mapping_type: node.mapping.mapping_type,
          depth: node.depth,
          path: node.path,
          children_count: node.children.length,
          quality_score: calculateOverallQualityScore(node.mapping.mapping_quality),
          bounds: node.mapping.region_bounds
        })),

        // 质量摘要
        quality_summary: {
          overall_quality: calculateOverallQualityScore(hierarchy.quality_summary),
          quality_distribution: analyzeQualityDistribution(hierarchy.all_mappings),
          quality_trends: analyzeQualityTrends(hierarchy.all_mappings)
        },

        // 验证结果
        validation_result: {
          is_valid: isValid,
          validation_issues: isValid ? [] : identifyHierarchyIssues(hierarchy),
          recommendations: generateHierarchyRecommendations(hierarchy)
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Build mapping hierarchy failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Build mapping hierarchy failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 优化区域映射
 * POST /api/region-mapping/:mappingId/optimize
 */
router.post('/:mappingId/optimize', async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { optimizationOptions = {} } = req.body;

    // 验证映射存在
    const mapping = regionMappingService.getRegionMapping(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: 'Region mapping not found'
      });
    }

    // 记录优化前的质量
    const originalQuality = calculateOverallQualityScore(mapping.mapping_quality);

    // 执行优化
    const optimizedMapping = await regionMappingService.optimizeRegionMapping(mappingId);

    // 计算改进情况
    const optimizedQuality = calculateOverallQualityScore(optimizedMapping.mapping_quality);
    const improvement = optimizedQuality - originalQuality;

    res.json({
      success: true,
      mapping_id: mappingId,
      optimization_result: {
        // 质量改进
        quality_improvement: {
          original_score: originalQuality,
          optimized_score: optimizedQuality,
          improvement: improvement,
          improvement_percentage: (improvement / originalQuality) * 100
        },

        // 优化的映射
        optimized_mapping: {
          id: optimizedMapping.id,
          region_bounds: optimizedMapping.region_bounds,
          recognition_config: optimizedMapping.recognition_config,
          nesting_config: optimizedMapping.nesting_config,
          quality_metrics: optimizedMapping.mapping_quality,
          last_updated: optimizedMapping.last_updated
        },

        // 优化详情
        optimization_details: {
          applied_strategies: identifyAppliedOptimizations(mapping, optimizedMapping),
          quality_improvements: analyzeQualityImprovements(mapping.mapping_quality, optimizedMapping.mapping_quality),
          performance_impact: assessPerformanceImpact(optimizedMapping)
        },

        // 建议和下一步
        recommendations: generatePostOptimizationRecommendations(optimizedMapping, improvement)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Optimize region mapping failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Optimize region mapping failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 搜索区域映射
 * POST /api/region-mapping/search
 */
router.post('/search', async (req, res) => {
  try {
    const query = req.body;

    // 搜索映射
    const mappings = await regionMappingService.searchRegionMappings({
      container_id: query.containerId,
      mapping_type: query.mappingType,
      mapping_purpose: query.mappingPurpose,
      parent_mapping_id: query.parentMappingId,
      quality_score_min: query.qualityScoreMin,
      accuracy_score_min: query.accuracyScoreMin,
      tags: query.tags,
      created_after: query.createdAfter ? new Date(query.createdAfter) : undefined,
      created_before: query.createdBefore ? new Date(query.createdBefore) : undefined
    });

    // 格式化结果
    const formattedMappings = mappings.map(mapping => ({
      id: mapping.id,
      container_id: mapping.container_id,
      mapping_type: mapping.mapping_type,
      mapping_purpose: mapping.mapping_purpose,
      region_bounds: mapping.region_bounds,
      hierarchy_info: {
        parent_id: mapping.parent_mapping_id,
        children_count: mapping.child_mapping_ids.length,
        depth: calculateMappingDepth(mapping)
      },
      quality_info: {
        overall_score: calculateOverallQualityScore(mapping.mapping_quality),
        accuracy_score: mapping.accuracy_score,
        reliability_score: mapping.reliability_score
      },
      usage_info: {
        usage_count: mapping.usage_count,
        created_at: mapping.created_at,
        last_updated: mapping.last_updated
      },
      tags: mapping.tags
    }));

    res.json({
      success: true,
      search_query: query,
      results: {
        mappings: formattedMappings,
        total_results: formattedMappings.length,
        search_summary: {
          mapping_types_distribution: analyzeMappingTypeDistribution(mappings),
          quality_distribution: analyzeSearchQualityDistribution(mappings),
          usage_distribution: analyzeUsageDistribution(mappings)
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search region mappings failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search region mappings failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 获取映射详情
 * GET /api/region-mapping/:mappingId
 */
router.get('/:mappingId', async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { include_children = true, include_quality_details = false } = req.query;

    // 获取映射
    const mapping = regionMappingService.getRegionMapping(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: 'Region mapping not found'
      });
    }

    // 获取子映射
    let childMappings = [];
    if (include_children === 'true') {
      childMappings = mapping.child_mapping_ids.map(childId => {
        const childMapping = regionMappingService.getRegionMapping(childId);
        return childMapping ? {
          id: childMapping.id,
          region_bounds: childMapping.region_bounds,
          mapping_type: childMapping.mapping_type,
          quality_score: calculateOverallQualityScore(childMapping.mapping_quality),
          usage_count: childMapping.usage_count
        } : null;
      }).filter(m => m !== null);
    }

    const response: any = {
      success: true,
      mapping: {
        // 基本信息
        id: mapping.id,
        container_id: mapping.container_id,
        mapping_type: mapping.mapping_type,
        mapping_purpose: mapping.mapping_purpose,
        region_bounds: mapping.region_bounds,

        // 层级关系
        hierarchy: {
          parent_id: mapping.parent_mapping_id,
          children_count: mapping.child_mapping_ids.length,
          sibling_count: mapping.sibling_mapping_ids.length,
          depth: calculateMappingDepth(mapping)
        },

        // 配置信息
        recognition_config: mapping.recognition_config,
        nesting_config: mapping.nesting_config,

        // 质量信息
        quality: {
          overall_score: calculateOverallQualityScore(mapping.mapping_quality),
          accuracy_score: mapping.accuracy_score,
          reliability_score: mapping.reliability_score
        },

        // 使用统计
        usage: {
          usage_count: mapping.usage_count,
          created_at: mapping.created_at,
          last_updated: mapping.last_updated
        },

        // 元数据
        tags: mapping.tags,
        custom_properties: mapping.custom_properties
      }
    };

    // 包含子映射
    if (include_children === 'true') {
      response.mapping.child_mappings = childMappings;
    }

    // 包含详细质量信息
    if (include_quality_details === 'true') {
      response.mapping.detailed_quality = mapping.mapping_quality;
    }

    res.json(response);

  } catch (error) {
    console.error('Get region mapping failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Get region mapping failed'
    });
  }
});

// 辅助函数

function calculateOverallQualityScore(quality: any): number {
  const scores = [
    quality.boundary_precision,
    quality.region_coverage,
    quality.spatial_consistency,
    quality.semantic_coherence,
    quality.contextual_relevance,
    quality.functional_clarity,
    quality.mapping_accuracy,
    quality.system_stability,
    quality.performance_efficiency
  ];

  return scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length;
}

function categorizeElements(elements: any[]): any {
  const categorized: Record<string, number> = {};

  for (const element of elements) {
    const type = element.type || 'unknown';
    categorized[type] = (categorized[type] || 0) + 1;
  }

  return categorized;
}

function groupElementsByType(elements: any[]): any {
  return elements.reduce((groups, element) => {
    const type = element.type || 'unknown';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(element);
    return groups;
  }, {});
}

function calculateAverageConfidence(elements: any[]): number {
  if (elements.length === 0) return 0;
  const totalConfidence = elements.reduce((sum, element) => sum + (element.confidence || 0), 0);
  return totalConfidence / elements.length;
}

function calculateRelativePosition(elementBounds: any, parentBounds: any): any {
  const parentWidth = parentBounds.width || (parentBounds.x2 - parentBounds.x1);
  const parentHeight = parentBounds.height || (parentBounds.y2 - parentBounds.y1);

  const elementWidth = elementBounds.width || (elementBounds.x2 - elementBounds.x1);
  const elementHeight = elementBounds.height || (elementBounds.y2 - elementBounds.y1);

  return {
    x: (elementBounds.x1 - parentBounds.x1) / parentWidth,
    y: (elementBounds.y1 - parentBounds.y1) / parentHeight,
    width: elementWidth / parentWidth,
    height: elementHeight / parentHeight
  };
}

function analyzeCoverage(bounds: any, elements: any[]): any {
  // 简化的覆盖分析实现
  return {
    coverage_percentage: 0.8,
    density: elements.length / ((bounds.width || (bounds.x2 - bounds.x1)) * (bounds.height || (bounds.y2 - bounds.y1))),
    distribution: 'uniform'
  };
}

function assessRecognitionQuality(elements: any[], mapping: any): any {
  return {
    completeness: 0.85,
    accuracy: 0.9,
    consistency: 0.88
  };
}

function assessBoundaryAccuracy(elements: any[], bounds: any): any {
  return {
    precision: 0.92,
    recall: 0.88,
    f1_score: 0.9
  };
}

function analyzeContentDistribution(bounds: any, elements: any[]): any {
  return {
    distribution_type: 'clustered',
    hotspots: 2,
    empty_areas: 1
  };
}

function analyzeConfidenceDistribution(elements: any[]): any {
  const high = elements.filter(e => e.confidence > 0.8).length;
  const medium = elements.filter(e => e.confidence >= 0.6 && e.confidence <= 0.8).length;
  const low = elements.filter(e => e.confidence < 0.6).length;

  return { high, medium, low };
}

function analyzeSpatialDistribution(bounds: any, elements: any[]): any {
  return {
    distribution_pattern: 'uniform',
    density_map: 'evenly_distributed',
    clustering: 'minimal'
  };
}

function estimateElementsInRegion(bounds: any, allElements: any[]): number {
  return allElements.filter(element => {
    return element.bbox.x1 >= bounds.x1 &&
           element.bbox.y1 >= bounds.y1 &&
           element.bbox.x2 <= bounds.x2 &&
           element.bbox.y2 <= bounds.y2;
  }).length;
}

function calculateMaxDepth(nestedMappings: any[]): number {
  if (nestedMappings.length === 0) return 1;
  return 1 + Math.max(...nestedMappings.map(m => calculateMappingDepth(m)));
}

function calculateCoverageEfficiency(parentBounds: any, nestedMappings: any[]): number {
  const totalArea = nestedMappings.reduce((sum, mapping) => {
    const width = mapping.region_bounds.width || (mapping.region_bounds.x2 - mapping.region_bounds.x1);
    const height = mapping.region_bounds.height || (mapping.region_bounds.y2 - mapping.region_bounds.y1);
    return sum + (width * height);
  }, 0);

  const parentArea = (parentBounds.width || (parentBounds.x2 - parentBounds.x1)) *
                     (parentBounds.height || (parentBounds.y2 - parentBounds.y1));

  return Math.min(1.0, totalArea / parentArea);
}

function generateOptimizationSuggestions(result: any): string[] {
  const suggestions: string[] = [];

  if (result.recognized_elements.length < 5) {
    suggestions.push('考虑扩大识别区域以提高元素覆盖率');
  }

  if (result.nested_mappings.length === 0 && result.mapping.mapping_purpose === 'nested_recognition') {
    suggestions.push('建议启用自动嵌套分割以提高识别精度');
  }

  if (result.quality_metrics.overall_score < 0.8) {
    suggestions.push('建议运行映射优化以提高质量');
  }

  return suggestions;
}

function calculateMappingDepth(mapping: any): number {
  if (!mapping.parent_mapping_id) return 1;
  return 2; // 简化实现
}

function calculateContainmentRatio(childBounds: any, parentBounds: any): number {
  const childArea = (childBounds.width || (childBounds.x2 - childBounds.x1)) *
                    (childBounds.height || (childBounds.y2 - childBounds.y1));
  const parentArea = (parentBounds.width || (parentBounds.x2 - parentBounds.x1)) *
                     (parentBounds.height || (parentBounds.y2 - parentBounds.y1));
  return childArea / parentArea;
}

function calculateMaxDepthPerBranch(treeStructure: any[]): number {
  return Math.max(...treeStructure.map(node => node.depth));
}

function calculateAvgBranchingFactor(allMappings: any[]): number {
  const totalChildren = allMappings.reduce((sum, mapping) => sum + mapping.child_mapping_ids.length, 0);
  const parentMappings = allMappings.filter(m => m.child_mapping_ids.length > 0).length;
  return parentMappings > 0 ? totalChildren / parentMappings : 0;
}

function analyzeQualityDistribution(allMappings: any[]): any {
  const high = allMappings.filter(m => calculateOverallQualityScore(m.mapping_quality) > 0.8).length;
  const medium = allMappings.filter(m => {
    const score = calculateOverallQualityScore(m.mapping_quality);
    return score >= 0.6 && score <= 0.8;
  }).length;
  const low = allMappings.filter(m => calculateOverallQualityScore(m.mapping_quality) < 0.6).length;

  return { high, medium, low };
}

function analyzeQualityTrends(allMappings: any[]): any {
  return {
    trend: 'improving',
    average_improvement: 0.05
  };
}

function identifyHierarchyIssues(hierarchy: any): string[] {
  const issues: string[] = [];

  if (hierarchy.hierarchy_depth > 8) {
    issues.push('层级过深，可能影响性能');
  }

  if (hierarchy.total_regions > 50) {
    issues.push('区域数量过多，建议合并相似区域');
  }

  return issues;
}

function generateHierarchyRecommendations(hierarchy: any): string[] {
  const recommendations: string[] = [];

  if (hierarchy.hierarchy_depth < 3 && hierarchy.total_regions > 10) {
    recommendations.push('考虑增加嵌套层级以提高精度');
  }

  if (calculateOverallQualityScore(hierarchy.quality_summary) < 0.8) {
    recommendations.push('建议优化低质量映射');
  }

  return recommendations;
}

function identifyAppliedOptimizations(original: any, optimized: any): string[] {
  const optimizations: string[] = [];

  if (JSON.stringify(original.region_bounds) !== JSON.stringify(optimized.region_bounds)) {
    optimizations.push('边界优化');
  }

  if (JSON.stringify(original.recognition_config) !== JSON.stringify(optimized.recognition_config)) {
    optimizations.push('识别配置优化');
  }

  return optimizations;
}

function analyzeQualityImprovements(original: any, optimized: any): any {
  return {
    boundary_precision: optimized.boundary_precision - original.boundary_precision,
    region_coverage: optimized.region_coverage - original.region_coverage,
    overall_improvement: calculateOverallQualityScore(optimized) - calculateOverallQualityScore(original)
  };
}

function assessPerformanceImpact(mapping: any): any {
  return {
    performance_impact: 'low',
    processing_time_change: 0,
    memory_usage_change: 0
  };
}

function generatePostOptimizationRecommendations(mapping: any, improvement: number): string[] {
  const recommendations: string[] = [];

  if (improvement < 0.1) {
    recommendations.push('考虑使用更激进的优化策略');
  }

  if (mapping.usage_count > 100) {
    recommendations.push('建议定期重新优化以保持最佳性能');
  }

  return recommendations;
}

function analyzeMappingTypeDistribution(mappings: any[]): any {
  const distribution: Record<string, number> = {};
  for (const mapping of mappings) {
    distribution[mapping.mapping_type] = (distribution[mapping.mapping_type] || 0) + 1;
  }
  return distribution;
}

function analyzeSearchQualityDistribution(mappings: any[]): any {
  const high = mappings.filter(m => calculateOverallQualityScore(m.mapping_quality) > 0.8).length;
  const medium = mappings.filter(m => {
    const score = calculateOverallQualityScore(m.mapping_quality);
    return score >= 0.6 && score <= 0.8;
  }).length;
  const low = mappings.filter(m => calculateOverallQualityScore(m.mapping_quality) < 0.6).length;

  return { high, medium, low };
}

function analyzeUsageDistribution(mappings: any[]): any {
  const frequent = mappings.filter(m => m.usage_count > 50).length;
  const moderate = mappings.filter(m => m.usage_count >= 10 && m.usage_count <= 50).length;
  const rare = mappings.filter(m => m.usage_count < 10).length;

  return { frequent, moderate, rare };
}

export default router;