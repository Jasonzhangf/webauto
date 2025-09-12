#!/usr/bin/env node

/**
 * 使用CLIProxyAPI的token测试Qwen API
 * Test Qwen API using CLIProxyAPI token
 */

const axios = require('axios');
const fs = require('fs');

async function testCLIProxyAPIToken() {
  console.log('🔧 Testing Qwen API with CLIProxyAPI Token...\n');

  try {
    // 读取CLIProxyAPI的token
    const tokenPath = '/Users/fanzhang/.cli-proxy-api/qwen-.json';
    const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    
    console.log('📋 CLIProxyAPI Token Info:');
    console.log('  Access Token:', tokenData.access_token.substring(0, 20) + '...');
    console.log('  Resource URL:', tokenData.resource_url);
    console.log('  Email:', tokenData.email || 'Not available');
    console.log('  Expired:', tokenData.expired);
    
    // 测试API调用 - 使用正确的endpoint和模型名
    const testRequest = {
      model: 'qwen3-coder-plus',
      messages: [
        {
          role: 'user',
          content: 'Hello, please respond briefly'
        }
      ]
    };

    // 根据CLIProxyAPI的逻辑，如果resource_url存在，使用 portal.qwen.ai
    const endpoint = tokenData.resource_url ? 
      `https://${tokenData.resource_url}/v1/chat/completions` : 
      'https://portal.qwen.ai/v1/chat/completions';

    console.log('\n🌐 Making API call to:', endpoint);
    
    const response = await axios.post(endpoint, testRequest, {
      headers: {
        'Authorization': 'Bearer ' + tokenData.access_token,
        'Content-Type': 'application/json',
        'User-Agent': 'cli-proxy-api/1.0'
      }
    });

    console.log('✅ API call successful!');
    console.log('📝 Response:', response.data.choices?.[0]?.message?.content || 'No content');
    
  } catch (error) {
    console.log('❌ API call failed:');
    
    if (error.response) {
      console.log('  Status:', error.response.status);
      console.log('  Status Text:', error.response.statusText);
      console.log('  Data:', error.response.data);
    } else {
      console.log('  Error:', error.message);
    }
  }
}

testCLIProxyAPIToken();