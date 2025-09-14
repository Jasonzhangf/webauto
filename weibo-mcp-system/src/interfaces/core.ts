// Core interfaces for the Weibo Container Operating System
export interface IEntityRegistration {
  id: string;
  name: string;
  type: 'container' | 'element' | 'flow' | 'page' | 'system';
  
  metadata?: {
    version?: string;
    description?: string;
    tags?: string[];
  };
  
  statePattern?: {
    properties: string[];
    metrics: string[];
    events: string[];
  };
  
  monitoring?: {
    enabled: boolean;
    interval?: number;
    healthCheck?: boolean;
  };
  
  lifecycle?: {
    onRegistered?: () => Promise<void>;
    onUnregistered?: () => Promise<void>;
    onStateChange?: (newState: IEntityState, changes: IChangeSet) => Promise<void>;
  };
}

export interface IEntityState {
  id: string;
  name: string;
  type: string;
  status: 'registered' | 'initializing' | 'active' | 'inactive' | 'error';
  
  properties: Map<string, any>;
  metrics: Map<string, number | string>;
  
  health?: {
    status: 'healthy' | 'warning' | 'error';
    lastCheck: number;
    issues?: string[];
  };
  
  timestamp: number;
}

export interface IExecutionContext {
  container: any;
  stateCenter: any;
  page: any;
  timestamp: number;
}

export interface IOperation {
  id: string;
  name: string;
  description: string;
  category: OperationCategory;
  execute(context: IExecutionContext, params: any): Promise<OperationResult>;
}

export interface IChangeSet {
  hasChanges: boolean;
  changedProperties: Set<string>;
  changes: Map<string, any>;
}

export interface ContainerNode {
  id: string;
  name: string;
  type: string;
}

// Flow configuration interfaces
export interface FlowConfig {
  id: string;
  name: string;
  description?: string;
  steps: FlowStep[];
}

export interface FlowStep {
  type: 'operation' | 'condition' | 'loop' | 'parallel';
  id?: string;
  name?: string;
  
  // Operation step
  container?: string;
  operation?: string;
  params?: any;
  
  // Condition step
  condition?: ConditionConfig;
  trueBranch?: FlowBranch;
  falseBranch?: FlowBranch;
  
  // Loop step
  loop?: LoopConfig;
  steps?: FlowStep[];
  
  // Parallel step
  parallelSteps?: FlowStep[];
}

export interface FlowBranch {
  steps: FlowStep[];
}

export interface ConditionConfig {
  type: 'container_state' | 'expression' | 'custom';
  containerId?: string;
  property?: string;
  operator?: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
  value?: any;
  expression?: string;
}

export interface LoopConfig {
  type: 'fixed' | 'while_has_more' | 'until_condition';
  count?: number;
  maxIterations?: number;
  condition?: ConditionConfig;
}

export interface FlowResult {
  success: boolean;
  results: any[];
  performance: {
    startTime: number;
    endTime: number;
    duration: number;
  };
}

export interface IFlowState {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  startTime: number;
  results?: any[];
  error?: string;
}

// Operation interfaces
export enum OperationCategory {
  EXTRACTION = 'extraction',
  NAVIGATION = 'navigation',
  INTERACTION = 'interaction',
  VALIDATION = 'validation',
  PROCESSING = 'processing',
  FLOW = 'flow',
  SYSTEM = 'system'
}

export interface OperationResult {
  success: boolean;
  status: OperationStatus;
  data?: any;
  error?: OperationError;
  performance: {
    startTime: number;
    endTime: number;
    duration: number;
    memory: number;
  };
}

export enum OperationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface OperationError {
  message: string;
  stack?: string;
  code: string;
  timestamp: number;
}

// Data model interfaces
export interface UserProfile {
  userId: string;
  username: string;
  nickname: string;
  avatar: string;
  description?: string;
  location?: string;
  followCount: number;
  fansCount: number;
  postCount: number;
  verified?: boolean;
  verifiedType?: string;
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  content: string;
  publishTime: Date;
  images?: string[];
  videos?: string[];
  likeCount: number;
  commentCount: number;
  repostCount: number;
  isRepost?: boolean;
  originalPost?: Post;
}