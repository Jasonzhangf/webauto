#!/usr/bin/env node

/**
 * 测试CLIProxyAPI token的工具调用功能
 * Test Tool Calling with CLIProxyAPI Token
 */

const axios = require('axios');
const fs = require('fs');

async function testToolCallingWithCLIProxyAPIToken() {
  console.log('🔧 Testing Tool Calling with CLIProxyAPI Token...\n');

  try {
    // 读取CLIProxyAPI的token
    const tokenPath = '/Users/fanzhang/.cli-proxy-api/qwen-.json';
    const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    
    console.log('📋 CLIProxyAPI Token Info:');
    console.log('  Access Token:', tokenData.access_token.substring(0, 20) + '...');
    console.log('  Resource URL:', tokenData.resource_url);
    
    // 测试工具调用
    const toolCallingRequest = {
      model: 'qwen3-coder-plus',
      messages: [
        {
          role: 'user',
          content: 'What is the current weather in Beijing? Please use a weather tool to get this information.'
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
    };

    const endpoint = `https://${tokenData.resource_url}/v1/chat/completions`;

    console.log('\n🌐 Making tool calling API call to:', endpoint);
    console.log('📝 Testing with weather tool...');
    
    const response = await axios.post(endpoint, toolCallingRequest, {
      headers: {
        'Authorization': 'Bearer ' + tokenData.access_token,
        'Content-Type': 'application/json',
        'User-Agent': 'cli-proxy-api/1.0'
      }
    });

    console.log('✅ Tool calling API call successful!');
    console.log('📝 Response:', JSON.stringify(response.data, null, 2));
    
    // 检查是否有tool calls
    if (response.data.choices?.[0]?.message?.tool_calls) {
      console.log('\n🛠️ Tool calls detected:');
      response.data.choices[0].message.tool_calls.forEach((toolCall, index) => {
        console.log(`  Tool ${index + 1}: ${toolCall.function.name}`);
        console.log(`  Arguments: ${toolCall.function.arguments}`);
      });
    } else {
      console.log('\n📝 No tool calls in response - checking content...');
      console.log('Content:', response.data.choices?.[0]?.message?.content || 'No content');
    }
    
  } catch (error) {
    console.log('❌ Tool calling API failed:');
    
    if (error.response) {
      console.log('  Status:', error.response.status);
      console.log('  Status Text:', error.response.statusText);
      console.log('  Data:', error.response.data);
    } else {
      console.log('  Error:', error.message);
    }
  }
}

testToolCallingWithCLIProxyAPIToken();