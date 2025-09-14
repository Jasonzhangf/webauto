/**
 * Weibo Tasks Comprehensive Example
 * 
 * This example demonstrates how to use all three Weibo task types:
 * 1. User Homepage Task - Capture posts from a specific user's homepage
 * 2. Personal Homepage Task - Capture posts from logged-in user's feed  
 * 3. Search Results Task - Capture posts from search results
 * 
 * It also shows how to use the orchestrator to coordinate multiple tasks.
 */

import { 
  WeiboTaskOrchestrator,
  WeiboUserHomepageTask,
  WeiboPersonalHomepageTask,
  WeiboSearchResultsTask,
  createTaskOrchestrator,
  createUserHomepageTask,
  createPersonalHomepageTask,
  createSearchResultsTask,
  TaskChainConfig,
  TaskExecutionMode
} from './index';

/**
 * Example 1: Simple individual task execution
 */
async function exampleIndividualTasks() {
  console.log('=== Example 1: Individual Task Execution ===');

  // Create orchestrator
  const orchestrator = createTaskOrchestrator({
    id: 'example-orchestrator',
    name: 'Example Weibo Tasks Orchestrator',
    description: 'Demonstrating individual task execution',
    maxConcurrentTasks: 2,
    enableNotifications: true,
    logLevel: 'info'
  });

  await orchestrator.initialize();

  try {
    // Task 1: User Homepage Task
    const userHomepageConfig = {
      id: 'user-homepage-task-1',
      name: 'Tech User Homepage Capture',
      description: 'Capture posts from tech user homepage',
      userId: '2107014571', // Example user ID
      username: 'techuser',
      maxPosts: 20,
      scrollPages: 3,
      captureComments: true,
      captureImages: true,
      expandComments: true,
      postFilters: {
        minDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        keywords: ['技术', '科技', '创新'],
        minReposts: 10,
        minComments: 5
      }
    };

    const userTask = createUserHomepageTask(userHomepageConfig);
    orchestrator.addTask(userHomepageConfig);

    // Task 2: Personal Homepage Task
    const personalHomepageConfig = {
      id: 'personal-homepage-task-1',
      name: 'Personal Timeline Capture',
      description: 'Capture posts from personal timeline',
      feedType: 'timeline' as const,
      maxPosts: 30,
      scrollPages: 5,
      captureComments: true,
      realTimeRefresh: true,
      refreshInterval: 60000, // 1 minute
      postFilters: {
        keywords: ['AI', '人工智能', '机器学习'],
        excludeKeywords: ['广告', '推广'],
        userWhitelist: ['tech_influencer', 'ai_expert']
      }
    };

    const personalTask = createPersonalHomepageTask(personalHomepageConfig);
    orchestrator.addTask(personalHomepageConfig);

    // Task 3: Search Results Task
    const searchResultsConfig = {
      id: 'search-results-task-1',
      name: 'AI Technology Search',
      description: 'Search and capture posts about AI technology',
      searchQuery: '人工智能 2024',
      searchType: 'posts' as const,
      timeRange: {
        start: new Date('2024-01-01'),
        end: new Date()
      },
      sortBy: 'time' as const,
      maxResults: 50,
      searchPages: 3,
      captureComments: true,
      advancedFilters: {
        userTypes: ['verified'],
        contentTypes: ['original'],
        mediaTypes: ['text', 'image']
      }
    };

    const searchTask = createSearchResultsTask(searchResultsConfig);
    orchestrator.addTask(searchResultsConfig);

    // Start orchestrator
    await orchestrator.start();

    // Execute tasks individually
    console.log('Executing User Homepage Task...');
    const userResult = await orchestrator.executeTask(userHomepageConfig.id);
    console.log(`User task completed: ${userResult.success}, posts captured: ${userResult.metrics.contentCaptured}`);

    console.log('Executing Personal Homepage Task...');
    const personalResult = await orchestrator.executeTask(personalHomepageConfig.id);
    console.log(`Personal task completed: ${personalResult.success}, posts captured: ${personalResult.metrics.contentCaptured}`);

    console.log('Executing Search Results Task...');
    const searchResult = await orchestrator.executeTask(searchResultsConfig.id);
    console.log(`Search task completed: ${searchResult.success}, results captured: ${searchResult.metrics.contentCaptured}`);

    // Get summary
    const status = orchestrator.getStatus();
    console.log('Orchestrator Status:', {
      totalTasksExecuted: status.totalTasksExecuted,
      totalContentCaptured: status.totalContentCaptured,
      executionTime: status.executionTime
    });

  } catch (error) {
    console.error('Error in individual tasks example:', error);
  } finally {
    await orchestrator.cleanup();
  }
}

/**
 * Example 2: Batch execution
 */
async function exampleBatchExecution() {
  console.log('\n=== Example 2: Batch Execution ===');

  const orchestrator = createTaskOrchestrator({
    id: 'batch-orchestrator',
    name: 'Batch Execution Example',
    description: 'Demonstrating batch task execution',
    maxConcurrentTasks: 3,
    logLevel: 'info'
  });

  await orchestrator.initialize();

  try {
    // Add multiple search tasks for different queries
    const searchQueries = [
      { query: '区块链技术', name: 'Blockchain Technology' },
      { query: '5G应用', name: '5G Applications' },
      { query: '元宇宙发展', name: 'Metaverse Development' },
      { query: '新能源汽车', name: 'New Energy Vehicles' },
      { query: '人工智能医疗', name: 'AI Healthcare' }
    ];

    const taskIds: string[] = [];

    searchQueries.forEach((item, index) => {
      const config = {
        id: `search-task-${index}`,
        name: item.name,
        description: `Search for ${item.query}`,
        searchQuery: item.query,
        searchType: 'posts' as const,
        maxResults: 25,
        searchPages: 2,
        sortBy: 'hot' as const
      };

      orchestrator.addTask(config);
      taskIds.push(config.id);
    });

    await orchestrator.start();

    // Execute all tasks in batch
    console.log('Executing batch of 5 search tasks...');
    const results = await orchestrator.executeBatch(taskIds);

    // Analyze results
    const successfulTasks = results.filter(r => r.success);
    const failedTasks = results.filter(r => !r.success);
    const totalContent = results.reduce((sum, r) => sum + r.metrics.contentCaptured, 0);

    console.log('Batch Execution Results:', {
      totalTasks: results.length,
      successful: successfulTasks.length,
      failed: failedTasks.length,
      totalContentCaptured: totalContent,
      averageContentPerTask: totalContent / results.length
    });

    // Show failed tasks
    if (failedTasks.length > 0) {
      console.log('Failed tasks:', failedTasks.map(t => ({ 
        id: t.taskId, 
        errors: t.errors 
      })));
    }

  } catch (error) {
    console.error('Error in batch execution example:', error);
  } finally {
    await orchestrator.cleanup();
  }
}

/**
 * Example 3: Task chaining with different execution modes
 */
async function exampleTaskChaining() {
  console.log('\n=== Example 3: Task Chaining ===');

  const orchestrator = createTaskOrchestrator({
    id: 'chain-orchestrator',
    name: 'Task Chaining Example',
    description: 'Demonstrating different task chaining modes',
    maxConcurrentTasks: 2,
    logLevel: 'info'
  });

  await orchestrator.initialize();

  try {
    // Define task chain configurations
    const chains: TaskChainConfig[] = [
      {
        id: 'sequential-discovery-chain',
        name: 'Sequential Discovery Chain',
        description: 'Discover trending topics and capture related posts',
        executionMode: 'sequential',
        continueOnError: false,
        tasks: [
          {
            id: 'trending-search',
            name: 'Trending Topics Search',
            description: 'Search for trending topics',
            searchQuery: '今日热搜',
            searchType: 'posts' as const,
            maxResults: 10,
            searchPages: 1,
            sortBy: 'hot' as const
          },
          {
            id: 'tech-followup',
            name: 'Technology Follow-up',
            description: 'Search for technology-related posts',
            searchQuery: '科技新闻',
            searchType: 'posts' as const,
            maxResults: 15,
            searchPages: 2,
            sortBy: 'time' as const
          },
          {
            id: 'ai-specific',
            name: 'AI Specific Search',
            description: 'Search for AI-specific content',
            searchQuery: '人工智能突破',
            searchType: 'posts' as const,
            maxResults: 20,
            searchPages: 2,
            sortBy: 'relevant' as const
          }
        ]
      },
      {
        id: 'parallel-user-monitoring',
        name: 'Parallel User Monitoring',
        description: 'Monitor multiple users simultaneously',
        executionMode: 'parallel',
        continueOnError: true,
        tasks: [
          {
            id: 'user-monitor-1',
            name: 'Tech Influencer 1',
            description: 'Monitor tech influencer posts',
            userId: '2107014571',
            maxPosts: 10,
            scrollPages: 2
          },
          {
            id: 'user-monitor-2',
            name: 'Tech Influencer 2',
            description: 'Monitor another tech influencer',
            userId: '2208014572',
            maxPosts: 10,
            scrollPages: 2
          },
          {
            id: 'user-monitor-3',
            name: 'Tech Influencer 3',
            description: 'Monitor third tech influencer',
            userId: '2309014573',
            maxPosts: 10,
            scrollPages: 2
          }
        ]
      }
    ];

    // Add task chains to orchestrator
    chains.forEach(chain => {
      orchestrator.addTaskChain(chain);
      console.log(`Added chain: ${chain.name} with ${chain.tasks.length} tasks`);
    });

    await orchestrator.start();

    // Execute task chains
    for (const chain of chains) {
      console.log(`\nExecuting chain: ${chain.name} (${chain.executionMode} mode)`);
      
      const startTime = Date.now();
      const results = await orchestrator.executeTaskChain(chain.id);
      const executionTime = Date.now() - startTime;

      const successfulResults = results.filter(r => r.success);
      const totalContent = results.reduce((sum, r) => sum + r.metrics.contentCaptured, 0);

      console.log(`Chain "${chain.name}" completed:`, {
        executionMode: chain.executionMode,
        executionTime: `${executionTime}ms`,
        tasksCompleted: successfulResults.length,
        totalTasks: results.length,
        contentCaptured: totalContent,
        successRate: `${(successfulResults.length / results.length * 100).toFixed(1)}%`
      });
    }

  } catch (error) {
    console.error('Error in task chaining example:', error);
  } finally {
    await orchestrator.cleanup();
  }
}

/**
 * Example 4: Advanced monitoring and analytics
 */
async function exampleAdvancedMonitoring() {
  console.log('\n=== Example 4: Advanced Monitoring ===');

  const orchestrator = createTaskOrchestrator({
    id: 'monitoring-orchestrator',
    name: 'Advanced Monitoring Example',
    description: 'Demonstrating advanced monitoring and analytics',
    maxConcurrentTasks: 2,
    enableTaskChaining: true,
    enableRetryOnError: true,
    logLevel: 'debug'
  });

  await orchestrator.initialize();

  try {
    // Set up event listeners for monitoring
    const eventLog: any[] = [];
    
    orchestrator.on('task_started', (event) => {
      eventLog.push({ type: 'start', taskId: event.data.taskId, time: event.timestamp });
      console.log(`🚀 Task started: ${event.data.taskId}`);
    });

    orchestrator.on('task_completed', (event) => {
      eventLog.push({ type: 'complete', taskId: event.data.result.taskId, time: event.timestamp });
      console.log(`✅ Task completed: ${event.data.result.taskId}, content: ${event.data.result.metrics.contentCaptured}`);
    });

    orchestrator.on('task_failed', (event) => {
      eventLog.push({ type: 'failed', taskId: event.data.taskId, time: event.timestamp, error: event.data.error });
      console.log(`❌ Task failed: ${event.data.taskId}, error: ${event.data.error}`);
    });

    orchestrator.on('batch_completed', (event) => {
      console.log(`📊 Batch completed: ${event.data.successCount}/${event.data.taskIds.length} successful`);
    });

    // Create monitoring tasks
    const monitoringTasks = [
      {
        id: 'realtime-monitor',
        name: 'Real-time Timeline Monitor',
        description: 'Monitor personal timeline in real-time',
        feedType: 'timeline' as const,
        maxPosts: 15,
        scrollPages: 2,
        realTimeRefresh: true,
        refreshInterval: 30000,
        postFilters: {
          keywords: ['紧急', '重要', '新闻'],
          minReposts: 100
        }
      },
      {
        id: 'mention-monitor',
        name: 'Mentions Monitor',
        description: 'Monitor user mentions',
        feedType: 'mentions' as const,
        maxPosts: 20,
        scrollPages: 3,
        captureComments: true
      },
      {
        id: 'topic-monitor',
        name: 'Topic Monitor',
        description: 'Monitor specific topics',
        searchQuery: '#科技创新#',
        searchType: 'posts' as const,
        maxResults: 25,
        searchPages: 2,
        sortBy: 'time' as const
      }
    ];

    // Add monitoring tasks
    monitoringTasks.forEach(task => {
      orchestrator.addTask(task);
    });

    await orchestrator.start();

    // Execute monitoring tasks
    console.log('Starting advanced monitoring...');
    const taskIds = monitoringTasks.map(t => t.id);
    const results = await orchestrator.executeBatch(taskIds);

    // Generate analytics report
    const analytics = {
      totalTasks: results.length,
      successfulTasks: results.filter(r => r.success).length,
      totalContentCaptured: results.reduce((sum, r) => sum + r.metrics.contentCaptured, 0),
      totalLinksExtracted: results.reduce((sum, r) => sum + r.metrics.linksExtracted, 0),
      averageExecutionTime: results.reduce((sum, r) => sum + r.metrics.executionTime, 0) / results.length,
      totalStorageOperations: results.reduce((sum, r) => sum + r.metrics.storageOperations, 0),
      eventLogSize: eventLog.length
    };

    console.log('\n📈 Analytics Report:', analytics);

    // Show captured content summary
    const allContent = await orchestrator.getAllCapturedContent();
    console.log(`\n📋 Captured Content Summary:`);
    console.log(`- Total content items: ${allContent.length}`);
    console.log(`- Content types: ${new Set(allContent.map(c => c.type)).size} different types`);
    
    // Show content by type
    const contentByType = allContent.reduce((acc, content) => {
      acc[content.type] = (acc[content.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('- Content breakdown:', contentByType);

  } catch (error) {
    console.error('Error in advanced monitoring example:', error);
  } finally {
    await orchestrator.cleanup();
  }
}

/**
 * Main function to run all examples
 */
async function runAllExamples() {
  console.log('🚀 Starting Weibo Tasks Examples\n');

  try {
    // Run all examples with error handling
    await exampleIndividualTasks();
    await exampleBatchExecution();
    await exampleTaskChaining();
    await exampleAdvancedMonitoring();

    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
  }
}

// Export examples for individual execution
export {
  exampleIndividualTasks,
  exampleBatchExecution,
  exampleTaskChaining,
  exampleAdvancedMonitoring,
  runAllExamples
};

// Run all examples if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}