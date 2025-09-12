/**
 * OpenAI Standard Interface Definitions
 * 标准OpenAI接口定义
 */

// 标准 OpenAI Chat 请求接口
class OpenAIChatRequest {
  constructor(data) {
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
  
  validate() {
    if (!this.model) {
      throw new Error('Model is required');
    }
    if (!this.messages || this.messages.length === 0) {
      throw new Error('Messages are required');
    }
    return true;
  }
}

// 标准 OpenAI Chat 响应接口
class OpenAIChatResponse {
  constructor(data) {
    this.id = data.id;
    this.object = data.object || 'chat.completion';
    this.created = data.created || Date.now();
    this.model = data.model;
    this.choices = data.choices || [];
    this.usage = data.usage;
    this.system_fingerprint = data.system_fingerprint;
  }
  
  toStandardFormat() {
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

// 标准消息格式
class ChatMessage {
  constructor(role, content) {
    this.role = role;
    this.content = content;
    this.name = null;
    this.function_call = null;
    this.tool_calls = null;
  }
  
  static user(content) {
    return new ChatMessage('user', content);
  }
  
  static assistant(content, toolCalls = null) {
    const msg = new ChatMessage('assistant', content);
    if (toolCalls) {
      msg.tool_calls = toolCalls;
    }
    return msg;
  }
  
  static system(content) {
    return new ChatMessage('system', content);
  }
  
  static tool(toolId, content) {
    const msg = new ChatMessage('tool', content);
    msg.tool_call_id = toolId;
    return msg;
  }
}

// 标准选择格式
class ChatChoice {
  constructor(index, message, finishReason = 'stop') {
    this.index = index;
    this.message = message;
    this.finish_reason = finishReason;
    this.logprobs = null;
  }
}

// 标准工具调用格式
class ToolCall {
  constructor(id, type, function_) {
    this.id = id;
    this.type = type;
    this.function = function_;
  }
}

// 标准函数调用格式
class FunctionCall {
  constructor(name, arguments_) {
    this.name = name;
    this.arguments = arguments_;
  }
}

// 标准工具格式
class ChatTool {
  constructor(type, function_) {
    this.type = type;
    this.function = function_;
  }
}

// 标准使用统计
class UsageStats {
  constructor(promptTokens = 0, completionTokens = 0, totalTokens = 0) {
    this.prompt_tokens = promptTokens;
    this.completion_tokens = completionTokens;
    this.total_tokens = totalTokens;
  }
}

module.exports = {
  OpenAIChatRequest,
  OpenAIChatResponse,
  ChatMessage,
  ChatChoice,
  ToolCall,
  FunctionCall,
  ChatTool,
  UsageStats
};