export interface WebAutoConfig {
  websocketUrl: string;
  sessionId?: string;
  outputFormat: 'json' | 'table' | 'yaml';
  verbose: boolean;
  configPath?: string;
  timeout?: number;
  retryCount?: number;
}

export interface CommandResult {
  success: boolean;
  data?: any;
  result?: any;
  error?: string;
  message?: string;
  executionTime?: number;
}

export interface SessionInfo {
  sessionId: string;
  capabilities: string[];
  mode: string;
  currentUrl?: string;
  createdAt: string;
  lastActivity: string;
  status: string;
}

export interface ContainerMatch {
  containerId: string;
  containerName: string;
  selector?: string;
  count?: number;
}

export interface NodeExecution {
  nodeType: string;
  parameters: Record<string, any>;
  result: any;
  success: boolean;
  executionTime: number;
}

export interface PythonCommand {
  command_type: string;
  action?: string;
  node_type?: string;
  parameters?: Record<string, any>;
  capabilities?: string[];
  browser_config?: Record<string, any>;
  timestamp?: string;
}

export interface WebSocketMessage {
  type: 'command' | 'response' | 'error' | 'event';
  sessionId?: string;
  data?: any;
  message?: string;
  timestamp: number;
}
