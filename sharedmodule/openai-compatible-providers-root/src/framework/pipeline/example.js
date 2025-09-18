/**
 * Pipeline Framework Usage Example
 * 流水线框架使用示例
 */

const PipelineManager = require('./pipeline/PipelineManager');

async function main() {
  // 创建流水线管理器
  const pipelineManager = new PipelineManager();

  // 创建Anthropic到OpenAI的流水线
  const anthropicPipelineConfig = {
    name: 'anthropic-to-openai-pipeline',
    inputProtocol: 'anthropic',
    llmSwitch: {
      name: 'anthropic-openai-switch',
      protocolMap: {
        "anthropic_to_openai": {
          "requestTemplate": {
            "model": "{{model}}",
            "messages": "{{messages}}",
            "temperature": "{{temperature}}",
            "max_tokens": "{{max_tokens}}",
            "stream": "{{stream}}",
            "tools": "{{tools}}",
            "tool_choice": "{{tool_choice}}"
          },
          "responseTemplate": {
            "id": "{{id}}",
            "object": "{{object}}",
            "created": "{{created}}",
            "model": "{{model}}",
            "choices": "{{choices}}",
            "usage": "{{usage}}"
          }
        }
      }
    },
    workflow: {
      name: 'stream-to-nonstream-workflow'
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

  // 创建OpenAI到OpenAI的流水线
  const openaiPipelineConfig = {
    name: 'openai-to-openai-pipeline',
    inputProtocol: 'openai',
    compatibility: {
      configPath: './config/openai-passthrough.config.json'
    },
    provider: {
      name: 'openai',
      apiKey: 'your-api-key',
      apiEndpoint: 'https://api.openai.com/v1/chat/completions'
    }
  };

  try {
    // 创建流水线
    const anthropicPipeline = pipelineManager.createPipeline(anthropicPipelineConfig);
    const openaiPipeline = pipelineManager.createPipeline(openaiPipelineConfig);

    console.log('Created pipelines:');
    console.log(pipelineManager.getAllPipelineInfo());

    // 示例输入数据
    const anthropicInput = {
      sourceProtocol: 'anthropic',
      targetProtocol: 'openai',
      data: {
        model: 'claude-3-opus-20240229',
        messages: [
          {
            role: 'user',
            content: 'Hello, how are you?'
          }
        ],
        temperature: 0.7,
        max_tokens: 1024,
        stream: false
      }
    };

    const openaiInput = {
      data: {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: 'Hello, how are you?'
          }
        ],
        temperature: 0.7,
        max_tokens: 1024,
        stream: false
      }
    };

    // 执行流水线
    console.log('\nExecuting Anthropic to OpenAI pipeline...');
    const anthropicResult = await pipelineManager.executePipeline('anthropic-to-openai-pipeline', anthropicInput);
    console.log('Anthropic pipeline result:', JSON.stringify(anthropicResult, null, 2));

    console.log('\nExecuting OpenAI to OpenAI pipeline...');
    const openaiResult = await pipelineManager.executePipeline('openai-to-openai-pipeline', openaiInput);
    console.log('OpenAI pipeline result:', JSON.stringify(openaiResult, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// 运行示例
if (require.main === module) {
  main();
}

module.exports = { main };