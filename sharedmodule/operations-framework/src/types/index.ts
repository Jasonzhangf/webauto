/**
 * Type definitions for Operations Framework
 */

// Base types and interfaces
export interface OperationConfig {
  [key: string]: any;
}

export interface PerformanceMetrics {
  speed: 'fast' | 'medium' | 'slow';
  accuracy: 'high' | 'medium' | 'low';
  successRate: number;
  memoryUsage: 'low' | 'medium' | 'high';
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  finalParams: OperationConfig;
}

export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
}

export interface OperationContext {
  page?: any;
  browser?: any;
  [key: string]: any;
}

export interface OperationResult {
  success: boolean;
  result?: any;
  error?: string;
  metadata?: {
    executionTime: number;
    [key: string]: any;
  };
}

// Base operation interface
export interface IBaseOperation {
  name: string;
  description: string;
  version: string;
  author: string;
  abstractCategories: string[];
  supportedContainers: string[];
  capabilities: string[];
  performance: PerformanceMetrics;
  requiredParameters: string[];
  optionalParameters: OperationConfig;
  stats: ExecutionStats;
  config: OperationConfig;

  execute(context: OperationContext, params?: OperationConfig): Promise<OperationResult>;
  validateParameters(params?: OperationConfig): ValidationResult;
  supportsContainer(containerType: string): boolean;
  hasCapability(capability: string): boolean;
  log(level: string, message: string, data?: any): void;
  updateStats(success: boolean, executionTime: number): void;
}

// Workflow types
export interface WorkflowStep {
  name?: string;
  operation: string | { name: string; config?: OperationConfig };
  params?: OperationConfig;
  timeout?: number;
  condition?: any;
  maxRetries?: number;
  retryDelay?: number;
}

export interface Workflow {
  name: string;
  description?: string;
  steps: WorkflowStep[];
  config?: OperationConfig;
}

export interface WorkflowTemplate {
  name: string;
  workflow: Workflow;
  registeredAt: number;
}

export interface WorkflowInstance {
  id: string;
  workflow: Workflow;
  executionContext: ExecutionContext;
  status: 'created' | 'running' | 'completed' | 'failed' | 'stopped';
  startTime: number | null;
  endTime: number | null;
  error: Error | null;
  results: any[];
  currentStep: number;
}

export interface ExecutionContextState {
  execution: {
    id: string;
    workflowId: string;
    startTime: number;
    initialState: OperationConfig;
  };
  operations: {
    active: Map<string, any>;
    completed: Map<string, any>;
    failed: Map<string, any>;
  };
  state: {
    [key: string]: any;
  };
}

export interface ExecutionContextConfig {
  reuseBrowser?: boolean;
  reusePage?: boolean;
  parallelExecution?: boolean;
  cleanupOnComplete?: boolean;
  debugMode?: boolean;
}

export interface ExecutionContext {
  state: ExecutionContextState;
  config: ExecutionContextConfig;

  updateState(key: string, value: any): void;
  registerOperation(id: string, instance: IBaseOperation, metadata?: any): string;
  completeOperation(id: string, result: OperationResult): void;
  failOperation(id: string, error: Error): void;
  getSummary(): any;
  cleanup(): Promise<void>;
}

// Workflow engine types
export interface WorkflowEngineConfig {
  maxConcurrency?: number;
  defaultTimeout?: number;
  enableLogging?: boolean;
  enableMetrics?: boolean;
  errorHandling?: 'stop' | 'continue' | 'retry';
  [key: string]: any;
}

export interface WorkflowEngineMetrics {
  workflowsStarted: number;
  workflowsCompleted: number;
  workflowsFailed: number;
  operationsExecuted: number;
  averageExecutionTime: number;
  executionTimes: number[];
}

// Extraction operation types
export interface LinkData {
  href: string;
  text: string;
  title: string;
  target: string;
  rel: string;
  className: string;
  id: string;
  innerHTML: string;
  domain: string;
  isInternal: boolean;
  isExternal: boolean;
  isValid: boolean;
  enrichmentTimestamp?: string;
  relevanceScore?: number;
}

export interface TextContent {
  title: string;
  mainText: string;
  headings: Array<{
    level: number;
    text: string;
    id: string;
  }>;
  paragraphs: string[];
  lists: Array<{
    type: string;
    items: string[];
  }>;
  tables: Array<{
    headers: string[];
    data: string[][];
  }>;
  images: Array<{
    src: string;
    alt: string;
    title: string;
    width: number;
    height: number;
  }>;
  metadata: {
    url: string;
    domain: string;
    language: string;
  };
  detectedLanguage?: string;
  processingTimestamp?: string;
  characterCount?: number;
  wordCount?: number;
}

export interface ImageData {
  src: string;
  alt: string;
  title: string;
  width: number;
  height: number;
  className: string;
  id: string;
  loading: string;
  format: string;
  isLazy: boolean;
  parentElement: string;
  isVisible: boolean;
  isDecorative: boolean;
  isInViewport: boolean;
  enrichmentTimestamp?: string;
  relevanceScore?: number;
  downloadPath?: string;
  downloaded?: boolean;
}

// Data processing types
export interface DataFilter {
  field: string;
  operator: string;
  value: any;
  type?: string;
}

export interface DataTransformation {
  [key: string]: any;
}

export interface ValidationRule {
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: any[];
}

// File operation types
export interface FileOperationConfig {
  createDirectory?: boolean;
  overwrite?: boolean;
  backup?: boolean;
  backupSuffix?: string;
  encoding?: string;
  permissions?: string;
}

export interface JsonFileConfig extends FileOperationConfig {
  indent?: number;
  validateJson?: boolean;
  minify?: boolean;
  includeMetadata?: boolean;
  metadataFields?: string[];
  prettyPrint?: boolean;
  sortKeys?: boolean;
}

export interface MarkdownConfig {
  template?: string;
  customTemplate?: string;
  title?: string;
  description?: string;
  frontmatter?: OperationConfig;
  includeTableOfContents?: boolean;
  tableOfContentsTitle?: string;
  maxDepth?: number;
  includeMetadata?: boolean;
  generateStats?: boolean;
  codeBlockLanguage?: string;
  dateFormat?: string;
}

export interface CsvConfig extends FileOperationConfig {
  delimiter?: string;
  bom?: boolean;
  includeHeaders?: boolean;
  headers?: string[];
  headerCase?: 'original' | 'uppercase' | 'lowercase';
  quoteAll?: boolean;
  escapeQuotes?: boolean;
  lineEnding?: string;
  dateFormat?: string;
  numberFormat?: string;
  booleanFormat?: string;
  nullValue?: string;
  includeRowNumbers?: boolean;
  rowNumberColumn?: string;
  validateData?: boolean;
  maxRows?: number;
  chunkSize?: number;
}