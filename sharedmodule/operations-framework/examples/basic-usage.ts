/**
 * Basic usage example for the WebAuto Operations Framework
 * Demonstrates core functionality with simple tasks
 */

import {
  createDaemon,
  TaskBuilder,
  ScheduleBuilder,
  ScheduleHelpers,
  DaemonConfig
} from '../src/index';

async function basicUsageExample() {
  console.log('🚀 WebAuto Operations Framework - Basic Usage Example\n');

  // Create daemon configuration
  const config: DaemonConfig = {
    name: 'Example Daemon',
    version: '1.0.0',
    port: 8080,
    host: 'localhost',
    logLevel: 'info',
    maxWorkers: 4,
    taskTimeout: 30000,
    healthCheckInterval: 10000,
    storagePath: './example-data',
    enableMetrics: true,
    enableWebSocket: true
  };

  try {
    // Create and start daemon
    console.log('📋 Creating daemon...');
    const daemon = await createDaemon(config);
    console.log('✅ Daemon started successfully\n');

    // Example 1: Create and submit a simple task
    console.log('📝 Example 1: Submitting a simple file task');
    const fileTask = new TaskBuilder('Create example file')
      .withType('operation')
      .withCategory('file')
      .withOperation('write')
      .withParameters({
        path: './example-data/test.txt',
        content: 'Hello from WebAuto Operations Framework!',
        encoding: 'utf8'
      })
      .withPriority('medium')
      .withTimeout(10000)
      .build();

    const taskId = await daemon.submitTask(fileTask);
    console.log(`✅ Task submitted with ID: ${taskId}\n`);

    // Example 2: Submit a browser task
    console.log('🌐 Example 2: Submitting a browser task');
    const browserTask = new TaskBuilder('Fetch webpage')
      .withType('operation')
      .withCategory('browser')
      .withOperation('navigate')
      .withParameters({
        url: 'https://example.com',
        waitFor: 'h1'
      })
      .withPriority('high')
      .withTimeout(15000)
      .withMetadata({ description: 'Fetch example.com homepage' })
      .build();

    const browserTaskId = await daemon.submitTask(browserTask);
    console.log(`✅ Browser task submitted with ID: ${browserTaskId}\n`);

    // Example 3: Create a schedule
    console.log('⏰ Example 3: Creating a daily schedule');
    const dailySchedule = new ScheduleBuilder('Daily cleanup')
      .withCronExpression('0 2 * * *') // Daily at 2 AM
      .withTaskTemplate({
        name: 'Daily cleanup task',
        type: 'operation',
        category: 'file',
        operation: 'cleanup',
        parameters: {
          directory: './example-data/temp',
          olderThan: '7d'
        },
        priority: 'low',
        maxRetries: 3,
        timeout: 300000
      })
      .withEnabled(true)
      .build();

    const scheduleId = await daemon.scheduler.addSchedule(dailySchedule);
    console.log(`✅ Schedule created with ID: ${scheduleId}\n`);

    // Example 4: Using predefined schedule helpers
    console.log('⏰ Example 4: Creating hourly health check');
    const healthCheckSchedule = ScheduleHelpers.hourly(0) // Every hour at minute 0
      .withName('System health check')
      .withTaskTemplate({
        name: 'Health check',
        type: 'operation',
        category: 'communication',
        operation: 'health_check',
        parameters: { components: ['cpu', 'memory', 'disk'] },
        priority: 'high',
        timeout: 30000
      })
      .build();

    const healthScheduleId = await daemon.scheduler.addSchedule(healthCheckSchedule);
    console.log(`✅ Health check schedule created with ID: ${healthScheduleId}\n`);

    // Example 5: Check daemon status
    console.log('📊 Example 5: Checking daemon status');
    const health = await daemon.getHealthStatus();
    console.log('🏥 Health Status:', health.status);
    console.log('⏱️  Uptime:', `${Math.floor(health.uptime / 1000)}s`);
    console.log('📈 Components:', Object.entries(health.components)
      .filter(([_, healthy]) => healthy)
      .map(([component]) => component)
      .join(', '));
    console.log('');

    // Example 6: Get resource metrics
    console.log('📊 Example 6: Getting resource metrics');
    const metrics = await daemon.getResourceMetrics();
    console.log('💾 Memory Usage:', `${metrics.memory.percentage.toFixed(1)}%`);
    console.log('🖥️  CPU Usage:', `${metrics.cpu.usage.toFixed(1)}%`);
    console.log('💽 Disk Usage:', `${metrics.disk.percentage.toFixed(1)}%`);
    console.log('');

    // Example 7: Submit a batch of tasks
    console.log('📦 Example 7: Submitting a batch of tasks');
    const batchTasks = [
      new TaskBuilder('Batch task 1')
        .withCategory('file')
        .withOperation('read')
        .withParameters({ path: './package.json' })
        .build(),
      new TaskBuilder('Batch task 2')
        .withCategory('ai')
        .withOperation('analyze')
        .withParameters({ text: 'Analyze this text for sentiment' })
        .build(),
      new TaskBuilder('Batch task 3')
        .withCategory('communication')
        .withOperation('ping')
        .withParameters({ endpoint: 'https://api.example.com/health' })
        .build()
    ];

    const batchTaskIds = await Promise.all(
      batchTasks.map(task => daemon.submitTask(task))
    );
    console.log(`✅ Batch tasks submitted: ${batchTaskIds.join(', ')}\n`);

    // Example 8: Get statistics
    console.log('📈 Example 8: Getting daemon statistics');
    const stats = await daemon.getStats();
    console.log('📊 Statistics:');
    console.log(`  - Uptime: ${Math.floor(stats.uptime / 1000)}s`);
    console.log(`  - Active workers: ${stats.workers.active}`);
    console.log(`  - Queue length: ${stats.workers.queueLength}`);
    console.log(`  - Total tasks completed: ${stats.workers.totalTasksCompleted}`);
    console.log('');

    // Example 9: Create a workflow task
    console.log('🔄 Example 9: Creating a workflow task');
    const workflowTask = new TaskBuilder('Data processing workflow')
      .withType('workflow')
      .withCategory('file')
      .withOperation('process_data')
      .withParameters({
        inputPath: './data/input.csv',
        outputPath: './data/output.json',
        steps: [
          { operation: 'validate', parameters: { schema: 'data' } },
          { operation: 'transform', parameters: { format: 'json' } },
          { operation: 'save', parameters: { path: './data/processed/' } }
        ]
      })
      .withPriority('medium')
      .withTimeout(120000)
      .build();

    const workflowTaskId = await daemon.submitTask(workflowTask);
    console.log(`✅ Workflow task submitted with ID: ${workflowTaskId}\n`);

    // Example 10: List all schedules
    console.log('📋 Example 10: Listing all schedules');
    const schedules = await daemon.scheduler.getSchedules();
    console.log(`📅 Total schedules: ${schedules.length}`);
    schedules.forEach(schedule => {
      console.log(`  - ${schedule.name} (${schedule.enabled ? 'enabled' : 'disabled'})`);
      if (schedule.nextRun) {
        console.log(`    Next run: ${schedule.nextRun.toISOString()}`);
      }
    });
    console.log('');

    // Keep the daemon running for demonstration
    console.log('⏳ Keeping daemon running for 30 seconds...');
    console.log('💡 You can connect to the WebSocket server at:');
    console.log(`   ws://${config.host}:${config.port}`);
    console.log('');

    setTimeout(async () => {
      console.log('🛑 Shutting down daemon...');
      await daemon.stop();
      console.log('✅ Daemon stopped. Example completed.');
      process.exit(0);
    }, 30000);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Interrupt received, shutting down...');
      await daemon.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  basicUsageExample();
}

export { basicUsageExample };