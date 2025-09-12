#!/usr/bin/env node

/**
 * 直接测试Qwen API调用
 * Direct Qwen API Test
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function testDirectAPI() {
  console.log('🔧 Testing Direct Qwen API Call...\n');

  try {
    // 读取保存的token
    const tokenPath = path.join(process.env.HOME || process.env.USERPROFILE, '.webauto', 'auth', 'qwen-fixed-token.json');
    const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    
    console.log('📋 Using Token:');
    console.log('  Access Token:', tokenData.accessToken.substring(0, 20) + '...');
    console.log('  Expires:', new Date(tokenData.tokenExpiry).toISOString());
    
    // 测试API调用
    const testRequest = {
      model: 'qwen-turbo',
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ]
    };

    console.log('\n🌐 Making direct API call to https://chat.qwen.ai/api/v1/chat/completions...');
    
    const response = await axios.post('https://chat.qwen.ai/api/v1/chat/completions', testRequest, {
      headers: {
        'Authorization': 'Bearer ' + tokenData.accessToken,
        'Content-Type': 'application/json',
        'User-Agent': 'openai-compatible-providers/1.0'
      }
    });

    console.log('✅ API call successful!');
    console.log('📝 Response:', response.data.choices?.[0]?.message?.content || 'No content');
    
  } catch (error) {
    console.log('❌ Direct API call failed:');
    
    if (error.response) {
      console.log('  Status:', error.response.status);
      console.log('  Status Text:', error.response.statusText);
      console.log('  Headers:', error.response.headers);
      console.log('  Data:', error.response.data);
    } else {
      console.log('  Error:', error.message);
    }
  }
}

testDirectAPI();