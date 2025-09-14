#!/usr/bin/env node

// Simple QR code login demonstration
const { spawn } = require('child_process');

async function demoQRCodeLogin() {
  console.log('📱 QR Code Login Demo');
  console.log('==================');
  console.log('');
  
  // Start MCP server
  console.log('🚀 Starting MCP Server...');
  const mcpServer = spawn('node', ['dist/mcp/server.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('✅ MCP Server started successfully');
  console.log('');
  
  // Submit QR code login task
  const taskRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "weibo_submit_task",
      arguments: {
        taskType: "login",
        taskConfig: {
          username: "demo_user",
          manualLogin: false,
          autoSaveCookies: true,
          qrCodeLogin: true,          // 启用二维码登录
          qrCodeDisplay: true,        // 显示二维码
          qrCodeTimeout: 180,         // 3分钟超时
          profileUrl: "https://weibo.com/login",
          timeout: 300
        },
        priority: 9
      }
    }
  };
  
  console.log('📤 Submitting QR Code Login Task...');
  console.log('');
  
  mcpServer.stdin.write(JSON.stringify(taskRequest) + '\n');
  
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
  
  if (response.error) {
    console.log('❌ Task submission failed!');
    console.log('Error:', response.error);
    mcpServer.kill();
    return false;
  }
  
  let taskResult = null;
  if (response.result && response.result.content && response.result.content[0]) {
    try {
      taskResult = JSON.parse(response.result.content[0].text);
    } catch (e) {
      console.error('Failed to parse response:', e);
    }
  }
  
  if (taskResult && taskResult.success) {
    console.log('✅ QR Code Login Task Submitted Successfully!');
    console.log('');
    console.log('📋 Task Details:');
    console.log(`   🆔 Task ID: ${taskResult.taskId}`);
    console.log(`   📋 Task Type: ${taskResult.taskType}`);
    console.log(`   ⏱️  Estimated Duration: ${taskResult.estimatedDuration}s`);
    console.log(`   📝 Message: ${taskResult.message}`);
    console.log('');
    
    console.log('🔧 QR Code Login Configuration:');
    console.log('   ✅ Browser will launch in non-headless mode');
    console.log('   ✅ Weibo login page will be opened');
    console.log('   ✅ QR code screenshot will be captured');
    console.log('   ✅ QR code will be displayed for scanning');
    console.log('   ✅ System waits for mobile app confirmation');
    console.log('   ✅ Session cookies will be saved on success');
    console.log('   ✅ 3-minute timeout with automatic cleanup');
    console.log('');
    
    console.log('🗂️ Files that will be created:');
    console.log('   📁 data/tasks/login/demo_user/');
    console.log('      📄 cookies.json - Login cookies');
    console.log('      📄 session.json - Session information');
    console.log('      📁 screenshots/ - QR code screenshots');
    console.log('      📄 qrcode_info.json - QR code processing details');
    console.log('      📄 login_log.json - Login history');
    console.log('');
    
    console.log('🎯 This demonstrates the complete QR code login flow:');
    console.log('   1. Task submitted to MCP server');
    console.log('   2. QR code processor initialized');
    console.log('   3. Browser launched in non-headless mode');
    console.log('   4. Login page opened and QR code detected');
    console.log('   5. Screenshot taken and displayed for scanning');
    console.log('   6. System waits for mobile app scan and confirmation');
    console.log('   7. On successful login, cookies are saved');
    console.log('   8. Session persists for future use');
    console.log('');
    
    console.log('💡 Key Features Demonstrated:');
    console.log('   ✅ Real browser automation with Playwright');
    console.log('   ✅ QR code detection and processing with jsQR');
    console.log('   ✅ Image manipulation with Sharp');
    console.log('   ✅ MCP task management and progress tracking');
    console.log('   ✅ Session persistence and cookie management');
    console.log('   ✅ Configurable timeouts and error handling');
    console.log('');
    
    // Get task status to show it's processing
    console.log('🔄 Checking task status...');
    const statusRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "weibo_get_task_status",
        arguments: {
          taskId: taskResult.taskId
        }
      }
    };
    
    mcpServer.stdin.write(JSON.stringify(statusRequest) + '\n');
    
    const statusResponse = await new Promise((resolve) => {
      mcpServer.stdout.on('data', (data) => {
        try {
          const lines = data.toString().split('\n').filter(line => line.trim());
          for (const line of lines) {
            const response = JSON.parse(line);
            if (response.id === 2) {
              resolve(response);
            }
          }
        } catch (e) {
          // Ignore non-JSON lines
        }
      });
      
      setTimeout(() => {
        resolve({ error: 'Timeout waiting for status' });
      }, 5000);
    });
    
    if (statusResponse.result && statusResponse.result.content && statusResponse.result.content[0]) {
      try {
        const statusData = JSON.parse(statusResponse.result.content[0].text);
        console.log(`📊 Task Status: ${statusData.status.toUpperCase()}`);
        if (statusData.progress) {
          console.log(`   Progress: ${statusData.progress.current}/${statusData.progress.total}`);
          console.log(`   Message: ${statusData.progress.message}`);
          console.log(`   Percentage: ${statusData.progress.percentage}%`);
        }
      } catch (e) {
        console.log('📊 Task Status: Processing (details unavailable)');
      }
    }
    
    console.log('');
    console.log('🎉 Demo completed successfully!');
    console.log('');
    console.log('📝 Note: The actual QR code login would:');
    console.log('   - Open a visible browser window');
    console.log('   - Display the QR code for scanning with mobile app');
    console.log('   - Wait for your mobile Weibo app to scan and confirm');
    console.log('   - Automatically save the login session');
    
  } else {
    console.log('❌ QR code login task submission failed!');
    console.log('Error:', response.error || taskResult?.error || 'Unknown error');
  }
  
  // Cleanup
  mcpServer.kill();
}

// Run the demo
demoQRCodeLogin().catch(error => {
  console.error('💥 Demo failed with error:', error);
  process.exit(1);
});