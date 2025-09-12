#!/usr/bin/env node

/**
 * Tool Calling Test Script
 * 测试工具调用功能
 */

const { QwenProvider } = require('./dist/index');

async function testToolCalling() {
  console.log('🔧 Testing Tool Calling Functionality...\n');

  try {
    const provider = new QwenProvider({
      name: 'qwen-tool-test',
      endpoint: 'https://chat.qwen.ai/api/v1',
      supportedModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
      defaultModel: 'qwen-turbo'
    });
    
    // Check if token is valid
    if (!provider.accessToken || provider.isTokenExpired()) {
      console.log('🔐 No valid token, running authentication...');
      const authResult = await provider.authenticate(true, { interval: 3, maxAttempts: 10 });
      if (!authResult.success) {
        console.log('❌ Authentication failed');
        return;
      }
    }
    
    console.log('✅ Token valid, testing tool call...');
    
    // Test a simple tool call
    const toolRequest = {
      model: 'qwen3-coder-plus',
      messages: [
        {
          role: 'user',
          content: 'What files are in the current directory? Please use the list_files tool.'
        }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'list_files',
            description: 'List files in a directory',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Directory path to list'
                }
              },
              required: ['path']
            }
          }
        }
      ]
    };
    
    console.log('📤 Sending tool request...\n');
    const result = await provider.executeChat(toolRequest);
    
    console.log('🎉 Tool call successful!');
    console.log('📋 Response:');
    console.log(JSON.stringify(result, null, 2));
    
    // Check if response contains tool calls
    if (result.choices && result.choices[0] && result.choices[0].message) {
      const message = result.choices[0].message;
      if (message.tool_calls) {
        console.log('\n🔧 Tool Calls Detected:');
        message.tool_calls.forEach((toolCall, index) => {
          console.log(`  ${index + 1}. ${toolCall.function.name}:`);
          console.log('     Arguments:', toolCall.function.arguments);
        });
      } else {
        console.log('\n⚠️  No tool calls in response');
      }
    }
    
  } catch (error) {
    console.error('❌ Tool call test failed:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// 运行测试
if (require.main === module) {
  testToolCalling().then(() => {
    console.log('\n✅ Tool calling test completed!');
  }).catch(console.error);
}

module.exports = testToolCalling;