/**
 * Simple test for operation-based pipeline system
 * 基于操作子的流水线系统简单测试
 */

import { OperationBasedPipelineSystem } from './src/operations/index.js';

async function testOperationBasedPipeline() {
  console.log('🚀 Testing Operation-Based Pipeline System\n');

  try {
    // Initialize the system
    console.log('1. Initializing operation-based pipeline system...');
    const pipelineSystem = new OperationBasedPipelineSystem();

    // Get system status
    console.log('2. Getting system status...');
    const status = pipelineSystem.getSystemStatus();
    console.log('✅ System Status:', JSON.stringify(status, null, 2));

    // Test request tracking
    console.log('\n3. Testing request tracking operation...');
    const trackingResult = await pipelineSystem.trackRequest(
      'test-provider',
      'test-operation',
      { userId: '123', action: 'test' }
    );
    console.log('✅ Request Tracking Result:', JSON.stringify(trackingResult.result, null, 2));

    // Test request scheduling
    console.log('\n4. Testing pipeline scheduling operation...');
    const schedulingResult = await pipelineSystem.scheduleRequest(
      { message: 'Hello, World!', model: 'test-model' },
      { priority: 1, timeout: 5000 }
    );
    console.log('✅ Scheduling Result:', JSON.stringify(schedulingResult.result, null, 2));

    // Test workflow execution
    console.log('\n5. Testing workflow execution...');
    const workflow = {
      id: 'test-workflow',
      name: 'Test Workflow',
      description: 'A simple test workflow',
      steps: [
        {
          id: 'step1',
          name: 'Track Request',
          operation: 'request-tracking',
          parameters: {
            provider: 'workflow-test',
            operation: 'workflow-execution',
            metadata: { workflowId: 'test-workflow' }
          }
        },
        {
          id: 'step2',
          name: 'Schedule Request',
          operation: 'pipeline-scheduling',
          parameters: {
            data: { workflow: 'test', step: 'step2' },
            priority: 1
          },
          dependsOn: ['step1']
        }
      ],
      config: {
        parallelExecution: false,
        maxRetries: 2,
        failFast: false
      }
    };

    const workflowResult = await pipelineSystem.executeWorkflow(workflow);
    console.log('✅ Workflow Result:', JSON.stringify({
      success: workflowResult.success,
      workflowId: workflowResult.workflowId,
      executionTime: workflowResult.executionTime,
      steps: workflowResult.steps
    }, null, 2));

    // Get operation statistics
    console.log('\n6. Getting operation statistics...');
    const stats = pipelineSystem.getOperationStatistics();
    console.log('✅ Operation Statistics:', JSON.stringify(stats, null, 2));

    // Health check
    console.log('\n7. Performing health check...');
    const health = await pipelineSystem.healthCheck();
    console.log('✅ Health Status:', JSON.stringify(health, null, 2));

    // System cleanup
    console.log('\n8. Performing system cleanup...');
    await pipelineSystem.cleanup();
    console.log('✅ System cleanup completed');

    console.log('\n🎉 All tests passed! Operation-based pipeline system is working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error instanceof Error ? error.message : String(error));
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace available');
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testOperationBasedPipeline()
    .then(() => {
      console.log('\n✅ Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

export { testOperationBasedPipeline };