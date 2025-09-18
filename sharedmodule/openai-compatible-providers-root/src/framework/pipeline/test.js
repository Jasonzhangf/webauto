/**
 * Pipeline Framework Test
 * 流水线框架测试
 */

const PipelineManager = require('./PipelineManager');
const path = require('path');

async function testPipeline() {
  // 创建流水线管理器
  const pipelineManager = new PipelineManager();

  // 创建OpenAI到OpenAI的流水线配置
  const openaiPipelineConfig = {
    name: 'openai-to-openai-pipeline',
    inputProtocol: 'openai',
    compatibility: {
      configPath: path.resolve(__dirname, '../config/openai-passthrough.config.json')
    },
    provider: {
      name: 'openai',
      apiKey: 'your-api-key',
      apiEndpoint: 'https://api.openai.com/v1/chat/completions'
    }
  };

  try {
    // 创建流水线
    console.log('Creating pipeline...');
    const pipeline = pipelineManager.createPipeline(openaiPipelineConfig);

    console.log('Pipeline created successfully!');
    console.log('Pipeline info:', pipeline.getPipelineInfo());

    // 示例输入数据
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
    console.log('\nExecuting pipeline...');
    const result = await pipeline.execute(openaiInput);
    console.log('Pipeline execution result:', JSON.stringify(result, null, 2));

    console.log('\nAll tests passed!');
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// 运行测试
if (require.main === module) {
  testPipeline();
}

module.exports = { testPipeline };