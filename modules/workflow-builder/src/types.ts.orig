export type WorkflowPhase =
  | 'idle'
  | 'navigating'
  | 'matching'
  | 'selecting'
  | 'highlighting'
  | 'extracting'
  | 'scrolling'
  | 'completed'
  | 'failed';

export type WorkflowStatus = {
  phase: WorkflowPhase;
  stepId?: string;
  message?: string;
  success?: boolean;
};

export type WorkflowLogLevel = 'info' | 'warn' | 'error' | 'debug';

export type WorkflowLogEntry = {
  level: WorkflowLogLevel;
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
};

export type WorkflowStatusEvent = {
  type: 'workflow:status';
  payload: WorkflowStatus;
};

export type WorkflowLogEvent = {
  type: 'workflow:log';
  payload: WorkflowLogEntry;
};

export type WorkflowEvent = WorkflowStatusEvent | WorkflowLogEvent;

export type WorkflowSubscription = {
  unsubscribe: () => void;
};

export type WorkflowEmitter = {
  emit: (event: WorkflowEvent) => void;
  subscribe: (listener: (event: WorkflowEvent) => void) => WorkflowSubscription;
};

export type ContainerMatchOptions = {
  profile: string;
  url: string;
  maxDepth?: number;
  maxChildren?: number;
};

export type HighlightSpec = {
  selector: string;
  style?: string;
  duration?: number;
  sticky?: boolean;
  label?: string;
};

export type ExtractedPost = {
  id: string;
  links: Array<{ href: string; text?: string }>;
  author?: string;
  content?: string;
  timestamp?: string;
};

export type ExtractedResults = {
  posts: ExtractedPost[];
  dedupedLinks: string[];
};

export type WorkflowExecutionOptions = {
  profile: string;
  url: string;
  targetCount: number;
  scrollLimit: number;
  highlight?: {
    containerStyle: string;
    postStyle: string;
    extractStyle: string;
  };
};

export type ContainerSnapshot = {
  id: string;
  match?: {
    nodes?: Array<{ selector?: string }>; 
  };
  children?: ContainerSnapshot[];
};

export type ContainerMatchSnapshot = {
  container_tree?: {
    containers?: ContainerSnapshot[];
  };
};

export type ContainerMatchResponse = {
  success: boolean;
  data?: { snapshot?: ContainerMatchSnapshot };
};

export type ContainerInspectResponse = {
  success: boolean;
  data?: { snapshot?: ContainerSnapshot };
};

export type OperationExecutionResponse = {
  success: boolean;
  data?: Record<string, unknown>;
};

export type UnifiedActionResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};
