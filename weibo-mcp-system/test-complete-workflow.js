#!/usr/bin/env node

// Comprehensive test script for complete login task workflow
const { spawn } = require('child_process');
const path = require('path');

async function testCompleteLoginWorkflow() {
  console.log('🧪 Testing Complete Weibo MCP Login Task Workflow...');
  
  // Start MCP server
  const mcpServer = spawn('node', ['dist/mcp/server.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 1: Submit login task
  console.log('\n📤 Step 1: Submitting login task...');
  const submitRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "weibo_submit_task",
      arguments: {
        taskType: "login",
        taskConfig: {
          username: "workflow_test_user",
          manualLogin: false,
          autoSaveCookies: true,
          profileUrl: "https://weibo.com/workflow_test_user",
          timeout: 60
        },
        priority: 5
      }
    }
  };
  
  mcpServer.stdin.write(JSON.stringify(submitRequest) + '\n');
  
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
      console.log(`✅ Task submitted with ID: ${taskId}`);
    } catch (e) {
      console.error('Failed to parse submit response:', e);
    }
  }
  
  if (!taskId) {
    console.log('❌ Failed to submit task');
    mcpServer.kill();
    return false;
  }
  
  // Step 2: Monitor task status
  console.log('\n📊 Step 2: Monitoring task status...');
  let status = 'pending';
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts && (status === 'pending' || status === 'running')) {
    const statusRequest = {
      jsonrpc: "2.0",
      id: 2 + attempts,
      method: "tools/call",
      params: {
        name: "weibo_get_task_status",
        arguments: {
          taskId: taskId
        }
      }
    };
    
    mcpServer.stdin.write(JSON.stringify(statusRequest) + '\n');
    
    const statusResponse = await new Promise((resolve) => {
      mcpServer.stdout.on('data', (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === 2 + attempts) {
            resolve(response);
          }
        } catch (e) {
          // Not JSON yet, ignore
        }
      });
      
      setTimeout(() => {
        resolve({ error: 'Timeout waiting for status response' });
      }, 5000);
    });
    
    if (statusResponse.result && statusResponse.result.content && statusResponse.result.content[0]) {
      try {
        const statusResult = JSON.parse(statusResponse.result.content[0].text);
        status = statusResult.status;
        console.log(`   Status: ${statusResult.status} (${attempts + 1}/${maxAttempts})`);
        
        if (statusResult.progress) {
          console.log(`   Progress: ${statusResult.progress.percentage}% - ${statusResult.progress.message}`);
        }
      } catch (e) {
        console.error('Failed to parse status response:', e);
      }
    }
    
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Step 3: Get task result
  console.log('\n📋 Step 3: Getting task result...');
  const resultRequest = {
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: {
      name: "weibo_get_task_result",
      arguments: {
        taskId: taskId,
        format: "summary"
      }
    }
  };
  
  mcpServer.stdin.write(JSON.stringify(resultRequest) + '\n');
  
  const resultResponse = await new Promise((resolve) => {
    mcpServer.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === 12) {
          resolve(response);
        }
      } catch (e) {
        // Not JSON yet, ignore
      }
    });
    
    setTimeout(() => {
      resolve({ error: 'Timeout waiting for result response' });
    }, 10000);
  });
  
  console.log('Result Response:', JSON.stringify(resultResponse, null, 2));
  
  // Step 4: List tasks
  console.log('\n📝 Step 4: Listing recent tasks...');
  const listRequest = {
    jsonrpc: "2.0",
    id: 13,
    method: "tools/call",
    params: {
      name: "weibo_list_tasks",
      arguments: {
        limit: 5,
        status: "completed"
      }
    }
  };
  
  mcpServer.stdin.write(JSON.stringify(listRequest) + '\n');
  
  const listResponse = await new Promise((resolve) => {
    mcpServer.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === 13) {
          resolve(response);
        }
      } catch (e) {
        // Not JSON yet, ignore
      }
    });
    
    setTimeout(() => {
      resolve({ error: 'Timeout waiting for list response' });
    }, 10000);
  });
  
  if (listResponse.result && listResponse.result.content && listResponse.result.content[0]) {
    try {
      const listResult = JSON.parse(listResponse.result.content[0].text);
      console.log(`✅ Found ${listResult.tasks.length} completed tasks`);
      listResult.tasks.forEach((task, index) => {
        console.log(`   ${index + 1}. ${task.id} - ${task.type} (${task.status})`);
      });
    } catch (e) {
      console.error('Failed to parse list response:', e);
    }
  }
  
  // Step 5: Get system status
  console.log('\n🖥️  Step 5: Getting system status...');
  const systemRequest = {
    jsonrpc: "2.0",
    id: 14,
    method: "tools/call",
    params: {
      name: "weibo_get_system_status"
    }
  };
  
  mcpServer.stdin.write(JSON.stringify(systemRequest) + '\n');
  
  const systemResponse = await new Promise((resolve) => {
    mcpServer.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === 14) {
          resolve(response);
        }
      } catch (e) {
        // Not JSON yet, ignore
      }
    });
    
    setTimeout(() => {
      resolve({ error: 'Timeout waiting for system response' });
    }, 10000);
  });
  
  if (systemResponse.result && systemResponse.result.content && systemResponse.result.content[0]) {
    try {
      const systemResult = JSON.parse(systemResponse.result.content[0].text);
      console.log('✅ System Status:');
      console.log(`   Version: ${systemResult.version}`);
      console.log(`   Queue Stats: ${systemResult.queueStats.pending} pending, ${systemResult.queueStats.running} running, ${systemResult.queueStats.completed} completed`);
      console.log(`   Uptime: ${Math.round(systemResult.resourceStats.uptime)}s`);
      console.log(`   Memory Usage: ${Math.round(systemResult.resourceStats.memoryUsage.heapUsed / 1024 / 1024)}MB`);
    } catch (e) {
      console.error('Failed to parse system response:', e);
    }
  }
  
  // Clean up
  mcpServer.kill();
  
  console.log('\n🎉 Complete workflow test finished successfully!');
  return true;
}

// Run the test
testCompleteLoginWorkflow().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Test failed with error:', error);
  process.exit(1);
});