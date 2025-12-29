export type CommandType =
  | 'browser_state'
  | 'page_control'
  | 'dom_operation'
  | 'user_action'
  | 'highlight'
  | 'container_operation';

export interface WsCommand {
  type: 'command';
  request_id: string;
  session_id: string;
  data: {
    command_type: CommandType;
    action: string;
    parameters?: Record<string, any>;
  };
}

export interface WsResponse {
  type: 'response';
  request_id: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface WsEvent {
  type: 'event';
  topic: string;
  session_id: string;
  data?: any;
}
