/**
 * Pipeline Factory - Creates pipeline instances from configuration
 * 流水线工厂 - 从配置创建流水线实例
 */

import { BaseProvider } from './BaseProvider';
import { PipelineTracker } from './PipelineTracker';
import { Pipeline, PipelineConfig, PipelineTarget } from './Pipeline';
import { VirtualModelConfig } from '../types/virtual-model';

export interface PipelineFactoryConfig {
  defaultTimeout: number;
  defaultHealthCheckInterval: number;
  defaultMaxRetries: number;
  defaultLoadBalancingStrategy: 'round-robin' | 'weighted' | 'least-connections' | 'random';
  enableHealthChecks: boolean;
  metricsEnabled: boolean;
}

export interface VirtualModelPipelineConfig {
  virtualModel: VirtualModelConfig;
  providers: Map<string, BaseProvider>;
  metadata?: Record<string, any>;
}

export interface PipelineCreationOptions {
  overrideTimeout?: number;
  overrideHealthCheckInterval?: number;
  overrideMaxRetries?: number;
  overrideLoadBalancingStrategy?: 'round-robin' | 'weighted' | 'least-connections' | 'random';
  customMetadata?: Record<string, any>;
  enableHealthChecks?: boolean;
}

export interface PipelineValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  pipelineConfig?: PipelineConfig;
}

/**
 * Pipeline Factory - Creates and configures pipeline instances
 * 流水线工厂 - 创建和配置流水线实例
 */
export class PipelineFactory {
  private config: PipelineFactoryConfig;
  private pipelineTracker: PipelineTracker;

  constructor(config: PipelineFactoryConfig, pipelineTracker: PipelineTracker) {
    this.config = config;
    this.pipelineTracker = pipelineTracker;
  }

  /**
   * Create pipeline from virtual model configuration
   * 从虚拟模型配置创建流水线
   */
  createPipelineFromVirtualModel(
    virtualModelConfig: VirtualModelPipelineConfig,
    options?: PipelineCreationOptions
  ): Pipeline | null {
    const validationResult = this.validateVirtualModelConfig(virtualModelConfig);

    if (!validationResult.isValid) {
      console.warn('Virtual model configuration validation failed:', validationResult.errors);
      return null;
    }

    const pipelineConfig = this.buildPipelineConfig(virtualModelConfig, options);

    if (!pipelineConfig) {
      console.error('Failed to build pipeline configuration');
      return null;
    }

    return new Pipeline(pipelineConfig, this.pipelineTracker);
  }

  /**
   * Create multiple pipelines from virtual model configurations
   * 从多个虚拟模型配置创建流水线
   */
  createPipelinesFromVirtualModels(
    virtualModelConfigs: VirtualModelPipelineConfig[],
    options?: PipelineCreationOptions
  ): Map<string, Pipeline> {
    const pipelines = new Map<string, Pipeline>();

    for (const config of virtualModelConfigs) {
      const pipeline = this.createPipelineFromVirtualModel(config, options);
      if (pipeline) {
        pipelines.set(config.virtualModel.id, pipeline);
      }
    }

    return pipelines;
  }

  /**
   * Validate virtual model configuration
   * 验证虚拟模型配置
   */
  validateVirtualModelConfig(config: VirtualModelPipelineConfig): PipelineValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate virtual model
    if (!config.virtualModel.id) {
      errors.push('Virtual model ID is required');
    }

    if (!config.virtualModel.name) {
      errors.push('Virtual model name is required');
    }

    if (!config.virtualModel.provider) {
      errors.push('Virtual model provider is required');
    }

    // Validate targets
    if (!config.virtualModel.targets || config.virtualModel.targets.length === 0) {
      errors.push('Virtual model must have at least one target');
    }

    // Validate providers
    if (config.providers.size === 0) {
      errors.push('No providers available for pipeline creation');
    }

    // Check if all target providers exist
    if (config.virtualModel.targets) {
      for (const target of config.virtualModel.targets) {
        if (!config.providers.has(target.providerId)) {
          errors.push(`Provider '${target.providerId}' not found for target '${target.modelId}'`);
        }
      }
    }

    // Warnings
    if (config.virtualModel.targets && config.virtualModel.targets.length === 1) {
      warnings.push('Single target configuration - load balancing will have no effect');
    }

    if (!config.virtualModel.capabilities || config.virtualModel.capabilities.length === 0) {
      warnings.push('No capabilities specified for virtual model');
    }

    // Build pipeline config for additional validation
    let pipelineConfig: PipelineConfig | undefined = undefined;
    if (errors.length === 0) {
      pipelineConfig = this.buildPipelineConfig(config) || undefined;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      pipelineConfig
    };
  }

  /**
   * Build pipeline configuration from virtual model config
   * 从虚拟模型配置构建流水线配置
   */
  private buildPipelineConfig(
    virtualModelConfig: VirtualModelPipelineConfig,
    options?: PipelineCreationOptions
  ): PipelineConfig | null {
    const { virtualModel, providers } = virtualModelConfig;

    // Build targets from virtual model configuration
    const targets: PipelineTarget[] = [];

    if (!virtualModel.targets) {
      return null;
    }

    for (const targetConfig of virtualModel.targets) {
      const provider = providers.get(targetConfig.providerId);
      if (!provider) {
        console.warn(`Provider '${targetConfig.providerId}' not found, skipping target`);
        continue;
      }

      const target: PipelineTarget = {
        id: `${virtualModel.id}_${targetConfig.providerId}_${targetConfig.modelId}`,
        provider,
        weight: targetConfig.weight || 1,
        enabled: targetConfig.enabled !== false, // Default to enabled
        healthStatus: 'unknown',
        lastHealthCheck: Date.now(),
        requestCount: 0,
        errorCount: 0,
        metadata: {
          keyIndex: targetConfig.keyIndex,
          virtualModelId: virtualModel.id,
          ...targetConfig
        }
      };

      targets.push(target);
    }

    if (targets.length === 0) {
      return null;
    }

    // Build pipeline configuration
    const pipelineConfig: PipelineConfig = {
      id: `pipeline_${virtualModel.id}_${Date.now()}`,
      name: `${virtualModel.name} Pipeline`,
      virtualModelId: virtualModel.id,
      description: virtualModel.name,
      targets,
      loadBalancingStrategy: options?.overrideLoadBalancingStrategy ||
                             this.config.defaultLoadBalancingStrategy,
      healthCheckInterval: options?.overrideHealthCheckInterval ||
                          this.config.defaultHealthCheckInterval,
      maxRetries: options?.overrideMaxRetries || this.config.defaultMaxRetries,
      timeout: options?.overrideTimeout || this.config.defaultTimeout,
      metadata: {
        virtualModelName: virtualModel.name,
        virtualModelProvider: virtualModel.provider,
        capabilities: virtualModel.capabilities || [],
        ...virtualModelConfig.metadata,
        ...options?.customMetadata
      }
    };

    return pipelineConfig;
  }

  /**
   * Create pipeline from explicit configuration
   * 从显式配置创建流水线
   */
  createPipelineFromConfig(config: PipelineConfig): Pipeline {
    const validationResult = this.validatePipelineConfig(config);

    if (!validationResult.isValid) {
      throw new Error(`Pipeline configuration validation failed: ${validationResult.errors.join(', ')}`);
    }

    return new Pipeline(config, this.pipelineTracker);
  }

  /**
   * Validate pipeline configuration
   * 验证流水线配置
   */
  validatePipelineConfig(config: PipelineConfig): PipelineValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!config.id) {
      errors.push('Pipeline ID is required');
    }

    if (!config.name) {
      errors.push('Pipeline name is required');
    }

    if (!config.virtualModelId) {
      errors.push('Virtual model ID is required');
    }

    // Targets validation
    if (!config.targets || config.targets.length === 0) {
      errors.push('Pipeline must have at least one target');
    }

    // Validate individual targets
    if (config.targets) {
      for (const target of config.targets) {
        if (!target.id) {
          errors.push('Target ID is required');
        }

        if (!target.provider) {
          errors.push('Target provider is required');
        }

        if (target.weight < 0) {
          errors.push('Target weight must be non-negative');
        }

        if (target.healthStatus && !['healthy', 'unhealthy', 'unknown'].includes(target.healthStatus)) {
          errors.push('Invalid target health status');
        }
      }
    }

    // Configuration validation
    if (config.timeout <= 0) {
      errors.push('Pipeline timeout must be positive');
    }

    if (config.healthCheckInterval <= 0) {
      errors.push('Health check interval must be positive');
    }

    if (config.maxRetries < 0) {
      errors.push('Max retries must be non-negative');
    }

    if (!['round-robin', 'weighted', 'least-connections', 'random'].includes(config.loadBalancingStrategy)) {
      errors.push('Invalid load balancing strategy');
    }

    // Warnings
    if (config.targets && config.targets.length === 1) {
      warnings.push('Single target configuration - load balancing will have no effect');
    }

    if (config.timeout < 5000) {
      warnings.push('Pipeline timeout is very short (< 5s)');
    }

    if (config.healthCheckInterval < 30000) {
      warnings.push('Health check interval is very frequent (< 30s)');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Clone pipeline configuration
   * 克隆流水线配置
   */
  clonePipelineConfig(config: PipelineConfig): PipelineConfig {
    return {
      ...config,
      targets: config.targets.map(target => ({
        ...target,
        provider: target.provider // Provider reference should remain the same
      })),
      metadata: config.metadata ? { ...config.metadata } : undefined
    };
  }

  /**
   * Get factory configuration
   * 获取工厂配置
   */
  getFactoryConfig(): PipelineFactoryConfig {
    return { ...this.config };
  }

  /**
   * Update factory configuration
   * 更新工厂配置
   */
  updateFactoryConfig(updates: Partial<PipelineFactoryConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Create minimal pipeline for testing
   * 创建用于测试的最小流水线
   */
  createTestPipeline(
    virtualModelId: string,
    providers: BaseProvider[],
    options?: PipelineCreationOptions
  ): Pipeline {
    const targets: PipelineTarget[] = providers.map((provider, index) => ({
      id: `test_target_${index}`,
      provider,
      weight: 1,
      enabled: true,
      healthStatus: 'healthy',
      lastHealthCheck: Date.now(),
      requestCount: 0,
      errorCount: 0,
      metadata: { test: true }
    }));

    const config: PipelineConfig = {
      id: `test_pipeline_${virtualModelId}_${Date.now()}`,
      name: `Test Pipeline for ${virtualModelId}`,
      virtualModelId,
      targets,
      loadBalancingStrategy: options?.overrideLoadBalancingStrategy || 'round-robin',
      healthCheckInterval: options?.overrideHealthCheckInterval || 60000,
      maxRetries: options?.overrideMaxRetries || 3,
      timeout: options?.overrideTimeout || 30000,
      metadata: {
        test: true,
        ...options?.customMetadata
      }
    };

    return this.createPipelineFromConfig(config);
  }
}