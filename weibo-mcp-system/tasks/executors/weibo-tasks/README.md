# Weibo Tasks System

A comprehensive automation system for capturing Weibo content using three main task types, built on top of the webauto modules ecosystem.

## Overview

This system provides three specialized task executors for Weibo automation:

1. **WeiboUserHomepageTask** - Capture posts from specific user homepages
2. **WeiboPersonalHomepageTask** - Capture posts from logged-in user's personal feed
3. **WeiboSearchResultsTask** - Capture posts from Weibo search results

All tasks are coordinated by a powerful **WeiboTaskOrchestrator** that supports sequential, parallel, and chained execution modes.

## Features

### Core Features
- **Intelligent Link Extraction**: Smart detection and filtering of Weibo post links
- **Detailed Content Capture**: Full-page screenshots, text extraction, comment expansion
- **Session Management**: Robust browser session handling with cookie support
- **Error Recovery**: Automatic retry logic and session reinitialization
- **Real-time Updates**: Support for live feed monitoring and refresh
- **Advanced Filtering**: Content, user, and media type filtering
- **Modular Design**: Easy to extend and customize

### Task-Specific Features

#### WeiboUserHomepageTask
- Capture posts from any user homepage (e.g., `https://weibo.com/u/2107014571`)
- Extract user metadata (followers, following count, verification status)
- Intelligent scrolling to load more posts
- Post filtering by date, keywords, engagement metrics
- Comment expansion for detailed analysis

#### WeiboPersonalHomepageTask
- Support for multiple feed types: timeline, mentions, comments, likes, groups
- Real-time feed refresh capabilities
- Login status verification
- Session management for authenticated access
- User whitelist/blacklist filtering

#### WeiboSearchResultsTask
- Advanced search with multiple types: posts, users, topics, videos, images
- Time range filtering and sorting options
- Pagination handling
- Advanced filtering by user type, content type, media type
- Search metadata extraction (total results, suggested queries, trending topics)

### Orchestrator Features
- **Multiple Execution Modes**: Sequential, parallel, and chained task execution
- **Concurrency Control**: Configurable maximum concurrent tasks
- **Task Chaining**: Create complex workflows with data flow between tasks
- **Batch Processing**: Execute multiple tasks efficiently
- **Event-Driven Architecture**: Comprehensive event system for monitoring
- **Resource Management**: Automatic cleanup and memory management
- **Retry Mechanisms**: Configurable retry policies with backoff

## Installation

```bash
npm install @webauto/weibo-tasks
```

## Quick Start

### Basic Usage

```typescript
import { 
  WeiboTaskOrchestrator, 
  WeiboUserHomepageConfig 
} from '@webauto/weibo-tasks';

// Create orchestrator
const orchestrator = new WeiboTaskOrchestrator({
  id: 'my-orchestrator',
  name: 'Weibo Automation Orchestrator',
  maxConcurrentTasks: 3,
  logLevel: 'info'
});

await orchestrator.initialize();

// Add a user homepage task
const userConfig: WeiboUserHomepageConfig = {
  id: 'user-task-1',
  name: 'Tech User Capture',
  userId: '2107014571',
  maxPosts: 20,
  captureComments: true
};

orchestrator.addTask(userConfig);

// Start and execute task
await orchestrator.start();
const result = await orchestrator.executeTask(userConfig.id);

console.log(`Captured ${result.metrics.contentCaptured} posts`);

// Cleanup
await orchestrator.cleanup();
```

### Task Configuration Examples

#### User Homepage Task

```typescript
const userTask: WeiboUserHomepageConfig = {
  id: 'user-homepage-1',
  name: 'Tech Influencer Posts',
  description: 'Capture posts from tech influencer',
  userId: '2107014571',
  username: 'tech_expert',
  maxPosts: 50,
  scrollPages: 5,
  captureComments: true,
  captureImages: true,
  expandComments: true,
  postFilters: {
    minDate: new Date('2024-01-01'),
    keywords: ['AI', 'technology', 'innovation'],
    minReposts: 100,
    minComments: 50,
    minLikes: 200
  },
  maxRetries: 3,
  retryDelay: 5000,
  timeout: 300000
};
```

#### Personal Homepage Task

```typescript
const personalTask: WeiboPersonalHomepageConfig = {
  id: 'personal-feed-1',
  name: 'My Timeline',
  description: 'Capture posts from personal timeline',
  feedType: 'timeline',
  maxPosts: 100,
  scrollPages: 10,
  captureComments: true,
  realTimeRefresh: true,
  refreshInterval: 60000,
  postFilters: {
    keywords: ['important', 'urgent'],
    excludeKeywords: ['advertisement', 'spam'],
    userWhitelist: ['trusted_friend', 'family_member'],
    userBlacklist: ['spam_account']
  }
};
```

#### Search Results Task

```typescript
const searchTask: WeiboSearchResultsConfig = {
  id: 'search-tech-1',
  name: 'Technology Search',
  description: 'Search for technology posts',
  searchQuery: '人工智能 2024',
  searchType: 'posts',
  timeRange: {
    start: new Date('2024-01-01'),
    end: new Date()
  },
  sortBy: 'time',
  maxResults: 100,
  searchPages: 5,
  captureComments: true,
  advancedFilters: {
    userTypes: ['verified'],
    contentTypes: ['original'],
    mediaTypes: ['text', 'image', 'video'],
    locationFilter: ['北京', '上海', '深圳']
  }
};
```

## Advanced Usage

### Task Chaining

```typescript
const chainConfig: TaskChainConfig = {
  id: 'discovery-chain',
  name: 'Content Discovery Chain',
  description: 'Discover trending topics and capture related content',
  executionMode: 'sequential',
  continueOnError: true,
  tasks: [
    {
      id: 'trending-search',
      name: 'Find Trending Topics',
      searchQuery: '今日热搜',
      searchType: 'posts',
      maxResults: 10
    },
    {
      id: 'tech-followup',
      name: 'Tech Related Search',
      searchQuery: '科技',
      searchType: 'posts',
      maxResults: 20
    },
    {
      id: 'ai-specific',
      name: 'AI Specific Content',
      searchQuery: '人工智能',
      searchType: 'posts',
      maxResults: 30
    }
  ]
};

orchestrator.addTaskChain(chainConfig);
const results = await orchestrator.executeTaskChain('discovery-chain');
```

### Batch Processing

```typescript
// Add multiple similar tasks
const queries = ['AI', '区块链', '5G', '元宇宙'];
const taskIds = [];

queries.forEach((query, index) => {
  const config = {
    id: `search-${index}`,
    name: `Search: ${query}`,
    searchQuery: query,
    maxResults: 25
  };
  
  orchestrator.addTask(config);
  taskIds.push(config.id);
});

// Execute all tasks in batch
const results = await orchestrator.executeBatch(taskIds);
```

### Event Monitoring

```typescript
// Set up event listeners
orchestrator.on('task_started', (event) => {
  console.log(`Task started: ${event.data.taskId}`);
});

orchestrator.on('task_completed', (event) => {
  const result = event.data.result;
  console.log(`Task completed: ${result.taskId}, content: ${result.metrics.contentCaptured}`);
});

orchestrator.on('task_failed', (event) => {
  console.log(`Task failed: ${event.data.taskId}, error: ${event.data.error}`);
});

orchestrator.on('batch_completed', (event) => {
  console.log(`Batch completed: ${event.data.successCount}/${event.data.taskIds.length} successful`);
});
```

## API Reference

### Classes

#### WeiboTaskExecutor
Base class for all Weibo tasks. Provides common functionality for:
- Session management
- Content capture
- Error handling
- Event emission

#### WeiboUserHomepageTask
Specialized task for capturing user homepage content.

**Methods:**
- `execute()`: Execute the task and return results
- `getCapturedPosts()`: Get captured posts
- `getConfig()`: Get task configuration

#### WeiboPersonalHomepageTask
Specialized task for capturing personal homepage content.

**Methods:**
- `execute()`: Execute the task and return results
- `getCapturedPosts()`: Get captured posts
- `getConfig()`: Get task configuration

#### WeiboSearchResultsTask
Specialized task for capturing search results content.

**Methods:**
- `execute()`: Execute the task and return results
- `getCapturedResults()`: Get captured results
- `getConfig()`: Get task configuration

#### WeiboTaskOrchestrator
Main orchestrator for coordinating multiple tasks.

**Methods:**
- `initialize()`: Initialize the orchestrator
- `addTask(config)`: Add a task to the orchestrator
- `removeTask(taskId)`: Remove a task from the orchestrator
- `addTaskChain(config)`: Add a task chain
- `executeTask(taskId)`: Execute a single task
- `executeTaskChain(chainId)`: Execute a task chain
- `executeBatch(taskIds)`: Execute multiple tasks in batch
- `start()`: Start the orchestrator
- `stop()`: Stop the orchestrator
- `cleanup()`: Clean up resources
- `getStatus()`: Get orchestrator status

### Configuration Interfaces

#### WeiboTaskConfig
Base configuration for all tasks.

```typescript
interface WeiboTaskConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  browserConfig?: any;
  captureConfig?: Partial<ContentCaptureConfig>;
  extractorConfig?: Partial<LinkExtractorConfig>;
  storageConfig?: Partial<StorageConfig>;
  analysisConfig?: AnalysisOptions;
}
```

#### WeiboTaskOrchestratorConfig
Orchestrator configuration.

```typescript
interface WeiboTaskOrchestratorConfig {
  id: string;
  name: string;
  description: string;
  maxConcurrentTasks?: number;
  globalTimeout?: number;
  storageConfig?: any;
  enableTaskChaining?: boolean;
  enableRetryOnError?: boolean;
  enableNotifications?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  taskScheduling?: {
    enableScheduler: boolean;
    scheduleInterval?: number;
    maxTasksPerInterval?: number;
  };
}
```

## Error Handling

The system provides comprehensive error handling:

```typescript
try {
  const result = await orchestrator.executeTask(taskId);
  if (result.success) {
    console.log('Task completed successfully');
  } else {
    console.log('Task failed:', result.errors);
  }
} catch (error) {
  console.error('Unexpected error:', error);
}
```

Common error scenarios:
- **Session errors**: Automatic reinitialization
- **Network errors**: Retry with backoff
- **Content capture errors**: Continue with other posts
- **Storage errors**: Retry storage operations

## Performance Considerations

### Concurrency
- Configure `maxConcurrentTasks` based on your system resources
- Too many concurrent tasks may trigger anti-bot measures
- Monitor memory usage with many concurrent sessions

### Timeouts
- Set appropriate timeouts for different task types
- Search tasks typically need longer timeouts
- User homepage tasks may vary based on post count

### Resource Management
- Always call `cleanup()` when done
- Monitor memory usage with many tasks
- Use batch processing for efficiency

## Best Practices

### 1. Task Configuration
- Use descriptive names and descriptions
- Set reasonable timeouts and retry limits
- Configure appropriate filtering to reduce noise

### 2. Error Handling
- Implement comprehensive error handling
- Log errors for debugging
- Use retry mechanisms for transient failures

### 3. Resource Management
- Clean up resources properly
- Monitor system resources
- Use appropriate concurrency levels

### 4. Performance
- Use batch processing for multiple similar tasks
- Configure appropriate timeouts
- Monitor memory usage

### 5. Security
- Don't store sensitive information in configuration
- Use secure session management
- Respect website terms of service

## Examples

See the `examples.ts` file for comprehensive usage examples:
- Individual task execution
- Batch processing
- Task chaining
- Advanced monitoring
- Error handling patterns

## Troubleshooting

### Common Issues

**Session initialization fails**
- Check browser compatibility
- Verify network connectivity
- Ensure proper permissions

**Content capture fails**
- Verify target URLs are accessible
- Check for anti-bot measures
- Ensure proper login status

**Storage operations fail**
- Check disk space and permissions
- Verify storage configuration
- Monitor file system limits

**Performance issues**
- Reduce concurrent task count
- Increase timeout values
- Monitor system resources

### Debug Mode

Enable debug logging for detailed information:

```typescript
const orchestrator = new WeiboTaskOrchestrator({
  // ... other config
  logLevel: 'debug'
});
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/your-repo/issues)
- Documentation: [API Reference](docs/api.md)
- Examples: [Usage Examples](examples/)