#!/usr/bin/env node

// Test script for QR code login functionality
const { spawn } = require('child_process');

async function testQRCodeLogin() {
  console.log('🧪 Testing Weibo MCP QR Code Login...');
  
  // Start MCP server
  const mcpServer = spawn('node', ['dist/mcp/server.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Submit QR code login task
  const qrCodeLoginRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "weibo_submit_task",
      arguments: {
        taskType: "login",
        taskConfig: {
          username: "qrcode_test_user",
          manualLogin: false,
          autoSaveCookies: true,
          qrCodeLogin: true,          // 启用二维码登录
          qrCodeDisplay: true,        // 显示二维码
          qrCodeTimeout: 180,         // 3分钟超时
          profileUrl: "https://weibo.com/qrcode_test_user",
          timeout: 300
        },
        priority: 8  // 高优先级
      }
    }
  };
  
  console.log('📱 Submitting QR code login task...');
  console.log('Request:', JSON.stringify(qrCodeLoginRequest, null, 2));
  
  mcpServer.stdin.write(JSON.stringify(qrCodeLoginRequest) + '\n');
  
  // Get response
  const response = await new Promise((resolve) => {
    mcpServer.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === 1) {
          resolve(response);
        }
      } catch (e) {
        // Not JSON yet, ignore
      }
    });
    
    setTimeout(() => {
      resolve({ error: 'Timeout waiting for response' });
    }, 10000);
  });
  
  console.log('📥 Response:', JSON.stringify(response, null, 2));
  
  // Parse response
  let taskResult = null;
  if (response.result && response.result.content && response.result.content[0]) {
    try {
      taskResult = JSON.parse(response.result.content[0].text);
    } catch (e) {
      console.error('Failed to parse task result:', e);
    }
  }
  
  if (taskResult && taskResult.success) {
    console.log('✅ QR code login task submitted successfully!');
    console.log(`🆔 Task ID: ${taskResult.taskId}`);
    console.log(`📋 Task Type: ${taskResult.taskType}`);
    console.log(`⏱️  Estimated duration: ${taskResult.estimatedDuration}s`);
    console.log(`📝 Message: ${taskResult.message}`);
    console.log('\n📱 QR Code login will:');
    console.log('   - Open Weibo login page in non-headless mode');
    console.log('   - Take screenshot of QR code area');
    console.log('   - Display QR code for scanning');
    console.log('   - Wait for mobile app scan and confirmation');
    console.log('   - Save session cookies after successful login');
    
    // Clean up
    mcpServer.kill();
    return true;
  } else {
    console.log('❌ QR code login task submission failed!');
    console.log('Error:', response.error || taskResult?.error || 'Unknown error');
    
    // Clean up
    mcpServer.kill();
    return false;
  }
}

// Run the test
testQRCodeLogin().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Test failed with error:', error);
  process.exit(1);
});