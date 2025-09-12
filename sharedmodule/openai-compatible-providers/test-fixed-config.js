#!/usr/bin/env node

/**
 * 使用修复后的配置测试我们的QwenProvider
 * Test Our QwenProvider with Fixed Configuration
 */

const { QwenProvider } = require('./dist/index');
const path = require('path');

async function testOurProviderWithFixedConfig() {
  console.log('🔧 Testing Our QwenProvider with Fixed Configuration...\n');

  try {
    // 使用正确的配置，参考CLIProxyAPI
    const qwenProvider = new QwenProvider({
      name: 'qwen-fixed-config-test',
      endpoint: 'https://portal.qwen.ai/v1',  // 修复：使用正确的endpoint
      supportedModels: ['qwen3-coder-plus', 'qwen3-coder-flash'],  // 修复：使用正确的模型名
      defaultModel: 'qwen3-coder-plus',
      tokenStoragePath: path.join(process.env.HOME || process.env.USERPROFILE, '.webauto', 'auth', 'qwen-fixed-config-token.json')
    });

    console.log('1. Starting authentication...');
    const authResult = await qwenProvider.authenticate(true, { 
      interval: 10, 
      maxAttempts: 30 
    });
    
    if (authResult.success) {
      console.log('✅ Authentication successful!');
      
      // 等待2秒确保token生效
      console.log('\n2. Waiting 2 seconds for token to activate...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 测试普通对话
      console.log('\n3. Testing regular chat...');
      try {
        const chatResponse = await qwenProvider.chat({
          model: 'qwen3-coder-plus',
          messages: [
            {
              role: 'user',
              content: 'Hello! Please respond briefly.'
            }
          ]
        });
        console.log('✅ Regular chat successful!');
        console.log('📝 Response:', chatResponse.choices?.[0]?.message?.content || 'No content');
      } catch (chatError) {
        console.log('❌ Regular chat failed:', chatError.message);
      }
      
      // 测试工具调用
      console.log('\n4. Testing tool calling...');
      try {
        const toolResponse = await qwenProvider.chat({
          model: 'qwen3-coder-plus',
          messages: [
            {
              role: 'user',
              content: 'What is the current weather in Beijing? Please use a weather tool.'
            }
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get current weather information for a city',
                parameters: {
                  type: 'object',
                  properties: {
                    city: {
                      type: 'string',
                      description: 'The city name'
                    }
                  },
                  required: ['city']
                }
              }
            }
          ],
          tool_choice: 'auto'
        });
        
        console.log('✅ Tool calling successful!');
        console.log('📝 Tool calls:', toolResponse.choices?.[0]?.message?.tool_calls || 'No tool calls');
        console.log('📝 Content:', toolResponse.choices?.[0]?.message?.content || 'No content');
        
      } catch (toolError) {
        console.log('❌ Tool calling failed:', toolError.message);
        if (toolError.response) {
          console.log('   Status:', toolError.response.status);
          console.log('   Data:', toolError.response.data);
        }
      }
      
    } else {
      console.log('❌ Authentication failed:', authResult.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

console.log('🚀 Starting fixed configuration test...\n');
testOurProviderWithFixedConfig();