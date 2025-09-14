#!/usr/bin/env node

// Real test for QR code login functionality
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

async function testRealQRCodeLogin() {
  console.log('🧪 Testing Real Weibo QR Code Login...');
  console.log('=========================================');
  
  // Start MCP server
  const mcpServer = spawn('node', ['dist/mcp/server.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('✅ MCP Server started');
  
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
          username: "real_test_user",
          manualLogin: false,
          autoSaveCookies: true,
          qrCodeLogin: true,          // 启用二维码登录
          qrCodeDisplay: true,        // 显示二维码
          qrCodeTimeout: 120,         // 2分钟超时 (for testing)
          profileUrl: "https://weibo.com/login",
          timeout: 300
        },
        priority: 9
      }
    }
  };
  
  console.log('📱 Submitting real QR code login task...');
  console.log('This will:');
  console.log('  1. Launch browser in non-headless mode');
  console.log('  2. Open Weibo login page');
  console.log('  3. Take QR code screenshot');
  console.log('  4. Display QR code for scanning');
  console.log('  5. Wait for mobile app scan and confirmation');
  console.log('  6. Save session cookies on successful login');
  console.log('=========================================');
  
  mcpServer.stdin.write(JSON.stringify(qrCodeLoginRequest) + '\n');
  
  // Get initial response
  const initialResponse = await new Promise((resolve) => {
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
      resolve({ error: 'Timeout waiting for initial response' });
    }, 10000);
  });
  
  if (initialResponse.error) {
    console.log('❌ Initial task submission failed!');
    console.log('Error:', initialResponse.error);
    mcpServer.kill();
    return false;
  }
  
  let taskResult = null;
  if (initialResponse.result && initialResponse.result.content && initialResponse.result.content[0]) {
    try {
      taskResult = JSON.parse(initialResponse.result.content[0].text);
    } catch (e) {
      console.error('Failed to parse initial response:', e);
    }
  }
  
  if (taskResult && taskResult.success) {
    console.log('✅ QR code login task submitted successfully!');
    console.log(`🆔 Task ID: ${taskResult.taskId}`);
    console.log(`📋 Task Type: ${taskResult.taskType}`);
    console.log(`⏱️  Estimated duration: ${taskResult.estimatedDuration}s`);
    console.log('');
    
    // Now monitor the task progress
    console.log('🔄 Monitoring task progress...');
    console.log('=========================================');
    
    const taskId = taskResult.taskId;
    let progressUpdates = [];
    
    // Monitor progress
    const monitorInterval = setInterval(async () => {
      const progressRequest = {
        jsonrpc: "2.0",
        id: progressUpdates.length + 2,
        method: "tools/call",
        params: {
          name: "weibo_get_task_status",
          arguments: {
            taskId: taskId
          }
        }
      };
      
      mcpServer.stdin.write(JSON.stringify(progressRequest) + '\n');
    }, 2000);
    
    // Listen for progress updates
    mcpServer.stdout.on('data', (data) => {
      try {
        const lines = data.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          const response = JSON.parse(line);
          if (response.result && response.result.content && response.result.content[0]) {
            try {
              const progressData = JSON.parse(response.result.content[0].text);
              progressUpdates.push(progressData);
              
              console.log(`[${new Date().toLocaleTimeString()}] ${progressData.status.toUpperCase()}`);
              if (progressData.progress) {
                console.log(`  Progress: ${progressData.progress.current}/${progressData.progress.total}`);
                console.log(`  Message: ${progressData.progress.message}`);
                console.log(`  Percentage: ${progressData.progress.percentage}%`);
              }
              console.log('---');
              
              // Check if task is completed or failed
              if (progressData.status === 'completed' || progressData.status === 'failed') {
                clearInterval(monitorInterval);
                console.log(`\n🏁 Task ${progressData.status.toUpperCase()}!`);
                
                if (progressData.status === 'completed') {
                  console.log('✅ QR code login completed successfully!');
                  console.log('Files created:');
                  if (progressData.result && progressData.result.summary) {
                    if (progressData.result.summary.files) {
                      progressData.result.summary.files.forEach(file => {
                        console.log(`  📄 ${file}`);
                      });
                    }
                    if (progressData.result.summary.directories) {
                      progressData.result.summary.directories.forEach(dir => {
                        console.log(`  📁 ${dir}`);
                      });
                    }
                  }
                } else {
                  console.log('❌ QR code login failed!');
                  if (progressData.error) {
                    console.log(`Error: ${progressData.error}`);
                  }
                }
                
                // Wait a bit then exit
                setTimeout(() => {
                  mcpServer.kill();
                  process.exit(progressData.status === 'completed' ? 0 : 1);
                }, 3000);
              }
            } catch (e) {
              // Ignore non-JSON responses
            }
          }
        }
      } catch (e) {
        // Ignore non-JSON lines
      }
    });
    
    // Set timeout for the entire test
    setTimeout(() => {
      console.log('\n⏰ Test timeout reached (5 minutes)');
      clearInterval(monitorInterval);
      mcpServer.kill();
      process.exit(1);
    }, 300000); // 5 minutes timeout
    
  } else {
    console.log('❌ QR code login task submission failed!');
    console.log('Error:', initialResponse.error || taskResult?.error || 'Unknown error');
    mcpServer.kill();
    return false;
  }
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(1);
});

// Run the test
testRealQRCodeLogin().catch(error => {
  console.error('💥 Test failed with error:', error);
  process.exit(1);
});