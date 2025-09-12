#!/usr/bin/env node

/**
 * 简单的API调用测试 - 验证token是否真的有效
 * Simple API Call Test - Verify if token is actually valid
 */

const { QwenProvider } = require('./dist/index');
const path = require('path');
const axios = require('axios');

async function testSimpleAPICall() {
  console.log('🧪 Testing Simple API Call with Current Token...\n');

  try {
    // 直接读取token文件
    const fs = require('fs');
    const tokenPath = path.join(process.env.HOME || process.env.USERPROFILE, '.webauto', 'auth', 'qwen-token.json');
    const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    
    console.log('📋 Token Info:');
    console.log('  Access Token:', tokenData.accessToken.substring(0, 20) + '...');
    console.log('  Expires:', new Date(tokenData.tokenExpiry).toISOString());
    console.log('  Is Expired:', Date.now() > tokenData.tokenExpiry);
    
    // 直接用axios测试API调用
    console.log('\n📤 Testing direct API call with axios...');
    
    const testRequest = {
      model: 'qwen-turbo',
      messages: [
        {
          role: 'user',
          content: 'Hello, just testing if the token works'
        }
      ],
      stream: false
    };
    
    try {
      const response = await axios.post('https://chat.qwen.ai/api/v1/chat/completions', testRequest, {
        headers: {
          'Authorization': 'Bearer ' + tokenData.accessToken,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('✅ API call successful!');
      console.log('📊 Status:', response.status);
      console.log('📝 Response:', response.data.choices?.[0]?.message?.content || 'No content');
      
    } catch (apiError) {
      console.log('❌ API call failed:', apiError.response?.status || 'No status');
      console.log('📄 Error details:', apiError.response?.data || 'No error data');
      
      if (apiError.response?.status === 401) {
        console.log('\n🔍 The token is invalid even though it\'s not expired!');
        console.log('This suggests the token was revoked or is malformed.');
      }
    }
    
    // 测试refresh token是否有效
    console.log('\n🔄 Testing refresh token...');
    
    const refreshData = {
      grant_type: 'refresh_token',
      client_id: 'f0304373b74a44d2b584a3fb70ca9e56',
      refresh_token: tokenData.refreshToken
    };
    
    try {
      const refreshResponse = await axios.post('https://chat.qwen.ai/api/v1/oauth2/token', refreshData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('✅ Refresh token works!');
      console.log('📊 New token received');
      
    } catch (refreshError) {
      console.log('❌ Refresh token failed:', refreshError.response?.status || 'No status');
      console.log('📄 Error details:', refreshError.response?.data || 'No error data');
    }
    
    console.log('\n🎯 Conclusion:');
    console.log('If both calls fail with 401, the OAuth flow has an issue.');
    console.log('If only access token fails but refresh works, token needs refresh.');
    console.log('If both work, the QwenProvider logic has a bug.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// 运行测试
console.log('🚀 Starting simple API call test...\n');
testSimpleAPICall();