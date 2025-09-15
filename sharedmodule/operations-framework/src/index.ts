/**
 * Operations Framework - Main Export Module
 *
 * This module provides a comprehensive framework for defining, registering,
 * and executing micro-operations with full TypeScript support.
 */

// Core Types and Interfaces
export * from './types';

// Core Base Classes
export { default as BaseOperation } from './core/BaseOperation';

// Micro-Operations
export * from './micro-operations/ExtractionOperations';
export * from './micro-operations/NavigationOperations';
export * from './micro-operations/DataProcessingOperations';
export * from './micro-operations/FileOperations';

// Workflow Engine
export { default as WorkflowEngine } from './WorkflowEngine';

// Execution Context
export { default as ExecutionContext, ExecutionContextManager } from './execution/ExecutionContext';

// Operation Registry
export { default as OperationRegistry, globalRegistry } from './core/OperationRegistry';

// Re-export commonly used types and interfaces
import {
  OperationConfig,
  OperationContext,
  OperationResult,
  Workflow,
  WorkflowStep,
  IBaseOperation,
  ExecutionContext as ExecutionContextType,
  PerformanceMetrics,
  ValidationResult,
  ExecutionStats
} from './types';

export {
  OperationConfig,
  OperationContext,
  OperationResult,
  Workflow,
  WorkflowStep,
  IBaseOperation,
  ExecutionContextType as ExecutionContext,
  PerformanceMetrics,
  ValidationResult,
  ExecutionStats
};

// Framework Version
export const FRAMEWORK_VERSION = '1.0.0';

// Framework Information
export const FRAMEWORK_INFO = {
  name: 'Operations Framework',
  version: FRAMEWORK_VERSION,
  description: 'A comprehensive framework for defining, registering, and executing micro-operations',
  author: 'WebAuto Team',
  license: 'MIT',
  repository: 'https://github.com/webauto/operations-framework',
  typescript: true,
  supportedNodeVersions: '>=16.0.0'
};

// Default configuration
export const DEFAULT_CONFIG = {
  maxConcurrency: 3,
  defaultTimeout: 30000,
  enableLogging: true,
  enableMetrics: true,
  errorHandling: 'stop' as const,
  reuseBrowser: true,
  reusePage: true,
  cleanupOnComplete: true,
  debugMode: false
};

// Utility functions for framework initialization
export const initializeFramework = (config: Partial<typeof DEFAULT_CONFIG> = {}) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  console.log(`Initializing ${FRAMEWORK_INFO.name} v${FRAMEWORK_VERSION}`);
  console.log('Configuration:', finalConfig);

  return finalConfig;
};

// Export framework metadata
export const getFrameworkInfo = () => FRAMEWORK_INFO;

// Export global registry for easy access
export { globalRegistry };

// Helper function to register all built-in operations
export const registerBuiltInOperations = () => {
  // Import and register all built-in operations
  const { LinkExtractorOperation, TextExtractorOperation, ImageExtractorOperation, ContentExtractorOperation } = require('./micro-operations/ExtractionOperations');
  const { PageNavigationOperation, ElementClickOperation, FormFillOperation } = require('./micro-operations/NavigationOperations');
  const { DataMergerOperation, DataFilterOperation, DataTransformerOperation, MarkdownConverterOperation } = require('./micro-operations/DataProcessingOperations');
  const { JsonFileSaverOperation, MarkdownFileSaverOperation, CsvFileSaverOperation } = require('./micro-operations/FileOperations');

  // Register extraction operations
  globalRegistry.register(new LinkExtractorOperation());
  globalRegistry.register(new TextExtractorOperation());
  globalRegistry.register(new ImageExtractorOperation());
  globalRegistry.register(new ContentExtractorOperation());

  // Register navigation operations
  globalRegistry.register(new PageNavigationOperation());
  globalRegistry.register(new ElementClickOperation());
  globalRegistry.register(new FormFillOperation());

  // Register data processing operations
  globalRegistry.register(new DataMergerOperation());
  globalRegistry.register(new DataFilterOperation());
  globalRegistry.register(new DataTransformerOperation());
  globalRegistry.register(new MarkdownConverterOperation());

  // Register file operations
  globalRegistry.register(new JsonFileSaverOperation());
  globalRegistry.register(new MarkdownFileSaverOperation());
  globalRegistry.register(new CsvFileSaverOperation());

  console.log('Registered all built-in operations');
  return globalRegistry.getStatistics();
};

// Main framework class that ties everything together
export class OperationsFramework {
  private config: typeof DEFAULT_CONFIG;
  private workflowEngine: any; // WorkflowEngine instance
  private contextManager: any; // ExecutionContextManager instance

  constructor(config: Partial<typeof DEFAULT_CONFIG> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialize();
  }

  private initialize() {
    // Initialize workflow engine
    const { WorkflowEngine } = require('./WorkflowEngine');
    this.workflowEngine = new WorkflowEngine(this.config);

    // Initialize execution context manager
    const { ExecutionContextManager } = require('./execution/ExecutionContext');
    this.contextManager = new ExecutionContextManager();

    // Register built-in operations
    registerBuiltInOperations();

    console.log('Operations Framework initialized successfully');
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflow: Workflow, context: OperationConfig = {}) {
    return this.workflowEngine.execute(workflow, context);
  }

  /**
   * Create a new execution context
   */
  createExecutionContext(initialState?: any) {
    return this.contextManager.createContext(initialState);
  }

  /**
   * Get workflow engine
   */
  getWorkflowEngine() {
    return this.workflowEngine;
  }

  /**
   * Get context manager
   */
  getContextManager() {
    return this.contextManager;
  }

  /**
   * Get framework configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Get framework statistics
   */
  getStatistics() {
    return {
      workflowEngine: this.workflowEngine.getMetrics(),
      operationRegistry: globalRegistry.getStatistics(),
      activeContexts: this.contextManager.getActiveContexts().length
    };
  }

  /**
   * Cleanup framework resources
   */
  async cleanup() {
    await this.contextManager.cleanupAll();
    this.workflowEngine.cleanup();
    console.log('Operations Framework cleaned up');
  }
}

// Export the main framework class as default
export default OperationsFramework;