// Type declarations for external modules
declare module 'rcc-basemodule' {
  export interface ModuleInfo {
    id: string;
    type: string;
    name: string;
    version: string;
    description: string;
    metadata?: Record<string, any>;
  }

  export interface ConnectionInfo {
    id: string;
    type: string;
    target: string;
    [key: string]: any;
  }

  export interface DataTransfer {
    id: string;
    data: any;
    source: string;
    target: string;
    timestamp: number;
  }

  export interface ValidationRule {
    field: string;
    type: string;
    required?: boolean;
    [key: string]: any;
  }

  export interface ValidationResult {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
  }

  export interface Message {
    id: string;
    type: string;
    payload: any;
    source: string;
    target?: string;
    timestamp: number;
    metadata?: Record<string, any>;
  }

  export interface MessageResponse {
    id: string;
    success: boolean;
    data?: any;
    error?: string;
    timestamp: number;
  }

  export interface MessageHandler {
    handleMessage(message: Message): Promise<MessageResponse | void>;
  }

  export class BaseModule implements MessageHandler {
    constructor(info: ModuleInfo);
    
    protected debug(message: string, data?: any, method?: string): void;
    protected log(message: string, data?: any, method?: string): void;
    protected logInfo(message: string, data?: any, method?: string): void;
    protected warn(message: string, data?: any, method?: string): void;
    protected error(message: string, data?: any, method?: string): void;
    
    getInfo(): ModuleInfo;
    getConfig(): Record<string, any>;
    configure(config: Record<string, any>): void;
    initialize(): Promise<void>;
    destroy(): Promise<void>;
  }

  export class MessageCenter {
    constructor();
    registerModule(moduleId: string, handler: MessageHandler): void;
    unregisterModule(moduleId: string): void;
    sendMessage(message: Message): Promise<MessageResponse>;
  }
}

declare module 'rcc-errorhandling' {
  export interface ErrorContext {
    error: Error;
    source: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: Date;
    [key: string]: any;
  }

  export class ErrorHandlingCenter {
    constructor(config: { id: string; name: string });
    handleError(context: ErrorContext): void;
  }
}

declare module 'open' {
  interface Options {
    wait?: boolean;
    url?: boolean;
    app?: string;
    [key: string]: any;
  }
  
  function open(target: string, options?: Options): Promise<any>;
  export default open;
}