#!/usr/bin/env node

// Test script for checking task status
const { spawn } = require('child_process');
const path = require('path');

async function testTaskStatus() {
  console.log('🧪 Testing Weibo MCP Task Status Check...');
  
  // Start MCP server
  const mcpServer = spawn('node', ['dist/mcp/server.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // First submit a login task
  const submitRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "weibo_submit_task",
      arguments: {
        taskType: "login",
        taskConfig: {
          username: "status_test_user",
          manualLogin: true,
          autoSaveCookies: true,
          timeout: 300
        },
        priority: 3
      }
    }
  };
  
  console.log('📤 Submitting login task for status test...');
  mcpServer.stdin.write(JSON.stringify(submitRequest) + '\n');
  
  // Get submit response
  const submitResponse = await new Promise((resolve) => {
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
      resolve({ error: 'Timeout waiting for submit response' });
    }, 10000);
  });
  
  let taskId = null;
  if (submitResponse.result && submitResponse.result.content && submitResponse.result.content[0]) {
    try {
      const taskResult = JSON.parse(submitResponse.result.content[0].text);
      taskId = taskResult.taskId;
      console.log(`🆔 Task submitted with ID: ${taskId}`);
    } catch (e) {
      console.error('Failed to parse submit response:', e);
    }
  }
  
  if (!taskId) {
    console.log('❌ Failed to submit task for status test');
    mcpServer.kill();
    return false;
  }
  
  // Wait a moment for task to be processed
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Now check task status
  const statusRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "weibo_get_task_status",
      arguments: {
        taskId: taskId
      }
    }
  };
  
  console.log('📊 Checking task status...');
  console.log('Request:', JSON.stringify(statusRequest, null, 2));
  
  mcpServer.stdin.write(JSON.stringify(statusRequest) + '\n');
  
  // Get status response
  const statusResponse = await new Promise((resolve) => {
    mcpServer.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === 2) {
          resolve(response);
        }
      } catch (e) {
        // Not JSON yet, ignore
      }
    });
    
    setTimeout(() => {
      resolve({ error: 'Timeout waiting for status response' });
    }, 10000);
  });
  
  console.log('📥 Status Response:', JSON.stringify(statusResponse, null, 2));
  
  // Parse status response
  let statusResult = null;
  if (statusResponse.result && statusResponse.result.content && statusResponse.result.content[0]) {
    try {
      statusResult = JSON.parse(statusResponse.result.content[0].text);
    } catch (e) {
      console.error('Failed to parse status result:', e);
    }
  }
  
  if (statusResult && statusResult.success) {
    console.log('✅ Task status test passed!');
    console.log(`🆔 Task ID: ${statusResult.taskId}`);
    console.log(`📋 Status: ${statusResult.status}`);
    console.log(`📝 Message: ${statusResult.message}`);
    if (statusResult.progress) {
      console.log(`📊 Progress: ${statusResult.progress.percentage}% - ${statusResult.progress.message}`);
    }
    return true;
  } else {
    console.log('❌ Task status test failed!');
    console.log('Error:', statusResponse.error || statusResult?.error || 'Unknown error');
    return false;
  }
}

// Run the test
testTaskStatus().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Test failed with error:', error);
  process.exit(1);
});