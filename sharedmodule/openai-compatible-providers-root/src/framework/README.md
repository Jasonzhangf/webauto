# WebAuto Pipeline Framework

A flexible framework for creating multi-provider LLM pipelines with configuration-driven compatibility. Supports Anthropic, OpenAI, and other providers with tool calling and streaming capabilities.

## Features

- **Multi-Provider Support**: Seamlessly integrate with Anthropic, OpenAI, and other LLM providers
- **Protocol Transformation**: Convert between different LLM API formats (Anthropic ↔ OpenAI)
- **Tool Calling**: Full support for function calling across different providers
- **Streaming**: Support for streaming responses from non-streaming providers
- **Configuration-Driven**: Easy setup with JSON configuration files
- **Modular Architecture**: Extensible pipeline nodes for custom processing

## Installation

```bash
npm install webauto-pipelinecframework
```

## Quick Start

```javascript
const { PipelineManager } = require('webauto-pipelinecframework');

// Create a pipeline manager
const pipelineManager = new PipelineManager();

// Create a pipeline configuration
const config = {
  name: 'anthropic-to-openai',
  inputProtocol: 'anthropic',
  llmSwitch: {
    name: 'protocol-switch',
    transformer: {
      type: 'pass-through'
    }
  },
  compatibility: {
    configPath: './config/openai-passthrough.config.json'
  },
  provider: {
    name: 'openai',
    apiKey: 'your-api-key',
    apiEndpoint: 'https://api.openai.com/v1/chat/completions'
  }
};

// Create and execute pipeline
const pipeline = pipelineManager.createPipeline(config);
const result = await pipelineManager.executePipeline('anthropic-to-openai', {
  sourceProtocol: 'anthropic',
  targetProtocol: 'openai',
  data: {
    model: 'claude-3-5-sonnet-20240620',
    messages: [
      {
        role: 'user',
        content: 'Hello, world!'
      }
    ],
    max_tokens: 1024
  }
});
```

## Key Components

### Pipeline Nodes
- `LLMSwitchNode`: Handles protocol field bidirectional conversion
- `WorkflowNode`: Handles streaming responses for non-streaming requests
- `CompatibilityNode`: Wraps compatibility transformations
- `ProviderNode`: Communicates with actual AI service providers

### Transformers
- `AnthropicTransformer`: Converts between Anthropic API format and unified format
- `OpenAITransformer`: Handles OpenAI API format with parameter validation
- `PassThroughTransformer`: Transparent transmission with configurable adjustments
- `UnifiedChatRequest/Response`: Standard formats for cross-provider compatibility

## License

MIT