#!/usr/bin/env node

// Simple test script for login task MCP interaction
const { spawn } = require('child_process');
const path = require('path');

async function testLoginTask() {
  console.log('🧪 Testing Weibo MCP Login Task Submission...');
  
  // Start MCP server
  const mcpServer = spawn('node', ['dist/mcp/server.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test login task submission
  const loginTaskRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "weibo_submit_task",
      arguments: {
        taskType: "login",
        taskConfig: {
          username: "test_user",
          manualLogin: true,
          autoSaveCookies: true,
          profileUrl: "https://weibo.com/test_user",
          timeout: 300
        },
        priority: 5
      }
    }
  };
  
  console.log('📤 Submitting login task...');
  console.log('Request:', JSON.stringify(loginTaskRequest, null, 2));
  
  // Send request to MCP server
  mcpServer.stdin.write(JSON.stringify(loginTaskRequest) + '\n');
  
  // Wait for response
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
    
    // Timeout after 10 seconds
    setTimeout(() => {
      resolve({ error: 'Timeout waiting for response' });
    }, 10000);
  });
  
  console.log('📥 Response:', JSON.stringify(response, null, 2));
  
  // Clean up
  mcpServer.kill();
  
  // Parse MCP response format
  let taskResult = null;
  if (response.result && response.result.content && response.result.content[0]) {
    try {
      taskResult = JSON.parse(response.result.content[0].text);
    } catch (e) {
      console.error('Failed to parse task result:', e);
    }
  }
  
  if (taskResult && taskResult.success) {
    console.log('✅ Login task test passed!');
    console.log(`🆔 Task ID: ${taskResult.taskId}`);
    console.log(`📋 Task Type: ${taskResult.taskType}`);
    console.log(`⏱️  Estimated duration: ${taskResult.estimatedDuration}s`);
    console.log(`📝 Message: ${taskResult.message}`);
    return true;
  } else {
    console.log('❌ Login task test failed!');
    console.log('Error:', response.error || taskResult?.error || 'Unknown error');
    return false;
  }
}

// Run the test
testLoginTask().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Test failed with error:', error);
  process.exit(1);
});