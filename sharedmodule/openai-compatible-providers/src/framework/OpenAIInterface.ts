/**
 * OpenAI Standard Interface Definitions (TypeScript version)
 * 标准OpenAI接口定义
 */

// Message role types
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

// Tool call type
export type ToolType = 'function';

// Finish reason types
export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter';

// Chat message interface
export interface ChatMessageData {
  role: MessageRole;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  name?: string | null;
  function_call?: FunctionCallData | null;
  tool_calls?: ToolCallData[] | null;
  tool_call_id?: string | null;
}

// Function call interface
export interface FunctionCallData {
  name: string;
  arguments: string; // JSON string
}

// Tool call interface
export interface ToolCallData {
  id: string;
  type: ToolType;
  function: FunctionCallData;
}

// Tool interface
export interface ChatToolData {
  type: ToolType;
  function: {
    name: string;
    description?: string;
    parameters: Record<string, any>;
  };
}

// Chat choice interface
export interface ChatChoiceData {
  index: number;
  message: ChatMessageData;
  finish_reason: FinishReason;
  logprobs?: any | null;
}

// Usage statistics interface
export interface UsageStatsData {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// OpenAI Chat Request interface
export interface OpenAIChatRequestData {
  model: string;
  messages: ChatMessageData[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[] | null;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number> | null;
  user?: string;
  tools?: ChatToolData[];
  tool_choice?: string | Record<string, any> | null;
}

// OpenAI Chat Response interface
export interface OpenAIChatResponseData {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatChoiceData[];
  usage?: UsageStatsData;
  system_fingerprint?: string;
}

// 标准 OpenAI Chat 请求类
export class OpenAIChatRequest {
  public model: string;
  public messages: ChatMessageData[];
  public temperature?: number;
  public max_tokens?: number;
  public top_p?: number;
  public n?: number;
  public stream: boolean;
  public stop?: string | string[] | null;
  public presence_penalty?: number;
  public frequency_penalty?: number;
  public logit_bias?: Record<string, number> | null;
  public user?: string;
  public tools?: ChatToolData[];
  public tool_choice?: string | Record<string, any> | null;

  constructor(data: OpenAIChatRequestData) {
    this.model = data.model;
    this.messages = data.messages || [];
    this.temperature = data.temperature;
    this.max_tokens = data.max_tokens;
    this.top_p = data.top_p;
    this.n = data.n;
    this.stream = data.stream || false;
    this.stop = data.stop;
    this.presence_penalty = data.presence_penalty;
    this.frequency_penalty = data.frequency_penalty;
    this.logit_bias = data.logit_bias;
    this.user = data.user;
    this.tools = data.tools;
    this.tool_choice = data.tool_choice;
  }
  
  validate(): boolean {
    if (!this.model) {
      throw new Error('Model is required');
    }
    if (!this.messages || this.messages.length === 0) {
      throw new Error('Messages are required');
    }
    return true;
  }
}

// 标准 OpenAI Chat 响应类
export class OpenAIChatResponse {
  public id: string;
  public object: string;
  public created: number;
  public model: string;
  public choices: ChatChoiceData[];
  public usage?: UsageStatsData;
  public system_fingerprint?: string;

  constructor(data: OpenAIChatResponseData) {
    this.id = data.id;
    this.object = data.object || 'chat.completion';
    this.created = data.created || Date.now();
    this.model = data.model;
    this.choices = data.choices || [];
    this.usage = data.usage;
    this.system_fingerprint = data.system_fingerprint;
  }
  
  toStandardFormat(): OpenAIChatResponseData {
    return {
      id: this.id,
      object: this.object,
      created: this.created,
      model: this.model,
      choices: this.choices,
      usage: this.usage,
      system_fingerprint: this.system_fingerprint
    };
  }
}

// 标准消息类
export class ChatMessage {
  public role: MessageRole;
  public content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  public name: string | null;
  public function_call: FunctionCallData | null;
  public tool_calls: ToolCallData[] | null;
  public tool_call_id: string | null;

  constructor(role: MessageRole, content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>) {
    this.role = role;
    this.content = content;
    this.name = null;
    this.function_call = null;
    this.tool_calls = null;
    this.tool_call_id = null;
  }
  
  static user(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): ChatMessage {
    return new ChatMessage('user', content);
  }
  
  static assistant(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>, toolCalls?: ToolCallData[]): ChatMessage {
    const msg = new ChatMessage('assistant', content);
    if (toolCalls) {
      msg.tool_calls = toolCalls;
    }
    return msg;
  }
  
  static system(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): ChatMessage {
    return new ChatMessage('system', content);
  }
  
  static tool(toolId: string, content: string): ChatMessage {
    const msg = new ChatMessage('tool', content);
    msg.tool_call_id = toolId;
    return msg;
  }
}

// 标准选择类
export class ChatChoice {
  public index: number;
  public message: ChatMessageData;
  public finish_reason: FinishReason;
  public logprobs: any | null;

  constructor(index: number, message: ChatMessageData, finishReason: FinishReason = 'stop') {
    this.index = index;
    this.message = message;
    this.finish_reason = finishReason;
    this.logprobs = null;
  }
}

// 标准工具调用类
export class ToolCall {
  public id: string;
  public type: ToolType;
  public function: FunctionCallData;

  constructor(id: string, type: ToolType, function_: FunctionCallData) {
    this.id = id;
    this.type = type;
    this.function = function_;
  }
}

// 标准函数调用类
export class FunctionCall {
  public name: string;
  public arguments: string;

  constructor(name: string, arguments_: string) {
    this.name = name;
    this.arguments = arguments_;
  }
}

// 标准工具类
export class ChatTool {
  public type: ToolType;
  public function: {
    name: string;
    description?: string;
    parameters: Record<string, any>;
  };

  constructor(type: ToolType, function_: {
    name: string;
    description?: string;
    parameters: Record<string, any>;
  }) {
    this.type = type;
    this.function = function_;
  }
}

// 标准使用统计类
export class UsageStats {
  public prompt_tokens: number;
  public completion_tokens: number;
  public total_tokens: number;

  constructor(promptTokens: number = 0, completionTokens: number = 0, totalTokens: number = 0) {
    this.prompt_tokens = promptTokens;
    this.completion_tokens = completionTokens;
    this.total_tokens = totalTokens;
  }
}

// All interfaces and types are already exported above