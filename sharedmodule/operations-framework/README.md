# WebAuto Operations Framework

A comprehensive micro-operations system for web automation and workflow orchestration. Built with TypeScript and Node.js, designed for scalable task execution with operation-based architecture, workflow engines, and specialized operations for complex automation scenarios.

## 🏗️ Architecture Overview

### Core Design Philosophy
The Operations Framework is built on a **micro-operations architecture** where complex tasks are broken down into atomic, reusable operations. Each operation inherits from a base class and can be combined into powerful workflows.

### Key Components

#### 1. Core Architecture (`src/core/`)
- **`BaseOperation.ts`** - Abstract base class for all operations
  - Provides common functionality for logging, validation, metrics
  - Defines operation interfaces and execution patterns
  - Supports abstract categories and capabilities declaration

- **`OperationRegistry.ts`** - Central registry for operation management
  - Registers and manages all available operations
  - Provides operation discovery and matching
  - Supports dynamic operation loading

- **`WorkerPool.ts`** - Concurrent task execution system
  - Manages worker threads for parallel operation execution
  - Handles load balancing and resource allocation
  - Provides task queuing and scheduling

- **`TaskOrchestrator.ts`** - High-level task coordination
  - Orchestrates complex multi-operation workflows
  - Manages dependencies and execution order
  - Handles error recovery and retry logic

- **`Scheduler.ts`** - Time-based task scheduling
  - Supports cron expressions and interval-based scheduling
  - Manages recurring tasks and batch processing
  - Provides calendar-based scheduling capabilities

- **`CommunicationManager.ts`** - Inter-component communication
  - Handles WebSocket-based real-time communication
  - Manages event broadcasting and subscription
  - Supports inter-process communication (IPC)

- **`ConfigManager.ts`** - Configuration management
  - Hot-reloadable configuration system
  - Environment variable support
  - Configuration validation and defaults

- **`ResourceMonitor.ts`** - System resource monitoring
  - Real-time CPU, memory, disk usage tracking
  - Performance metrics collection
  - Health checks and alert generation

#### 2. Operation Categories (`src/operations/`)

##### Weibo Operations (`src/operations/weibo/`)
- **`SinglePostDownloadOperation.js`** - Individual Weibo post downloading
  - Extracts post content, images, and metadata
  - Implements smart directory naming based on download type
  - Supports deduplication and history management
  - Key features: `determineFolderName()`, `checkAlreadyDownloaded()`, `recordDownloadHistory()`

- **`DownloadHistoryManagerOperation.js`** - Download history management
  - Manages download records with file synchronization
  - Handles cleanup when files are deleted
  - Provides history lookup and cleanup functionality
  - Key methods: `deletePostRecord()`, `cleanupOrphanedRecords()`, `checkPostDownloaded()`

- **`DownloadSummaryOperation.js`** - Content summarization
  - Generates download summaries in multiple formats
  - Supports current download, topic-all, and topic-daily summaries
  - Creates both JSON and Markdown reports
  - Key methods: `generateSummary()`, `analyzePostsData()`, `generateMarkdownSummary()`

##### Batch Operations (`src/operations/batch/`)
- **`BatchUrlProcessingOperation.js`** - Bulk URL processing
- **`BatchContentDownloadOperation.js`** - Batch content downloading
- **`BatchSystemInitializationOperation.js`** - Batch system setup

#### 3. Micro-Operations (`src/micro-operations/`)
Fine-grained atomic operations for specific tasks:

- **`BrowserOperations.ts`** - Browser automation tasks
- **`NavigationOperations.ts`** - Page navigation and interaction
- **`ExtractionOperations.ts`** - Data extraction and scraping
- **`FileOperations.ts`** - File system operations
- **`FileSystemOperations.ts`** - Advanced file management
- **`DataProcessingOperations.ts`** - Data transformation and processing
- **`AIOperations.ts`** - AI and machine learning tasks
- **`CommunicationOperations.ts`** - HTTP/API communication
- **`SearchOperations.ts`** - Search functionality
- **`CookieOperation.js`** - Cookie management
- **`FileSaveOperation.ts`** - File saving operations
- **`WeiboOperations.ts`** - Weibo-specific micro-operations

#### 4. Execution Context (`src/execution/`)
- **`ExecutionContext.ts`** - Operation execution environment
- **`ExecutionContextManager.ts`** - Context lifecycle management
- **`NestedOrchestrator.ts`** - Nested workflow orchestration

#### 5. Control Flow (`src/control-flow/`)
- **`ConditionalOperation.js`** - Conditional logic execution
- **`LoopOperation.js`** - Loop and iteration control

#### 6. Generic Operations (`src/generic/`)
- **`GenericWebScraperOperation.js`** - General web scraping
- **`ConfigurableDataProcessorOperation.js`** - Data processing
- **`AIServiceOperation.js`** - AI service integration
- **`NotificationOperation.js`** - Notification management

#### 7. Post-Processing (`src/post-processing/`)
- **`PostProcessingOperation.js`** - Base post-processing
- **`AISummarizerOperation.js`** - AI-powered summarization
- **`FileOrganizerOperation.js`** - File organization
- **`HTMLFormatterOperation.js`** - HTML formatting

#### 8. Specialized Operations
- **`BrowserOperation.js`** - Browser automation base
- **`FileOperation.js`** - File operations base
- **`AIOperation.js`** - AI operations base
- **`CommunicationOperation.js`** - Communication base

#### 9. Workflow Engine (`src/`)
- **`WorkflowEngine.ts`** - Workflow execution engine
- **`ConfigurableWorkflowExecutor.js`** - Configurable workflow execution

#### 10. Utilities (`src/utils/`)
- **`TaskBuilder.ts`** - Task construction utilities
- **`ScheduleBuilder.ts`** - Schedule creation helpers
- **`Logger.ts`** - Logging system
- **`HealthChecker.ts`** - Health checking utilities

#### 11. Configuration (`src/config/`)
- **`ConfigurationManager.js`** - Configuration management
- **`default.ts`** - Default configuration values

#### 12. Types (`src/types/`)
- **`operationTypes.ts`** - Operation type definitions
- **`index.ts`** - Type exports

#### 13. CLI (`src/cli/`)
- **`daemon-cli.ts`** - Command-line interface

#### 14. Workers (`src/workers/`)
- **`TaskWorker.ts`** - Task worker implementation

#### 15. Abstraction Layer (`src/abstraction/`)
- **`OperationMatcher.js`** - Operation matching and discovery
- **`AbstractStepRegistry.js`** - Abstract step registration
- **`AbstractStepMatcher.js`** - Step matching logic

## 📁 Workflow Configurations

The framework includes several pre-configured workflows for common automation scenarios:

#### Weibo Workflows (`workflows/`)
- **`weibo-homepage-workflow.json`** - Weibo homepage content extraction
  - Configured for trending topics, feed content, recommendations
  - Includes image filtering and deduplication
  - Supports customizable scroll counts and content types

- **`weibo-homepage-50posts-modified.json`** - Optimized for 50 posts extraction
  - Modified version of homepage workflow for specific volume requirements
  - Reduced scope for faster execution
  - Focused on feed content extraction

- **`weibo-search-workflow.json`** - Weibo search functionality
  - Search result extraction and processing
  - Multi-page search handling
  - Result filtering and categorization

- **`weibo-user-profile-workflow.json`** - User profile data extraction
  - Profile information scraping
  - Post history extraction
  - User metadata collection

- **`weibo-batch-download-workflow.json`** - Batch download operations
  - Bulk content downloading
  - Progress tracking and error handling
  - Resource management for large batches

## 🔧 Key Features

### 1. Smart Directory Naming
Operations automatically determine appropriate directory names based on content type:
- **Search results**: Use search keywords
- **User profiles**: Use username
- **Homepage content**: Use "微博主页" (Weibo Homepage)
- **Generic posts**: Use post ID or generated name

### 2. Download History Management
- Automatic tracking of downloaded content
- File-system synchronization (records deleted when files are deleted)
- Deduplication to prevent duplicate downloads
- History cleanup and maintenance utilities

### 3. One-Post-Per-Directory Structure
Each downloaded post gets its own directory with:
- `post-data.json` - Structured post data
- `post-content.md` - Markdown-formatted content
- Images and media files
- Metadata and extraction information

### 4. Content Summarization
Multiple summary types supported:
- **Current download**: Summary of just downloaded content
- **Topic-all**: Summary of all content on a topic
- **Topic-daily**: Daily summary for specific topics

### 5. Robust Error Handling
- Comprehensive error recovery mechanisms
- Retry logic with exponential backoff
- Graceful degradation and fallback strategies
- Detailed error logging and debugging information

### 6. Performance Monitoring
- Real-time performance metrics collection
- Resource usage monitoring
- Operation success rate tracking
- Execution time analysis

## 🚀 Usage Examples

### Basic Operation Usage
```typescript
import { SinglePostDownloadOperation } from './src/operations/weibo/SinglePostDownloadOperation.js';

const downloader = new SinglePostDownloadOperation({
  outputDir: './downloads',
  enableComments: true,
  enableImages: true
});

const result = await downloader.execute({
  url: 'https://weibo.com/status/1234567890',
  downloadType: 'homepage',
  keyword: 'technology',
  username: 'user123'
});
```

### Workflow Execution
```typescript
import { ConfigurableWorkflowExecutor } from './src/ConfigurableWorkflowExecutor.js';

const executor = new ConfigurableWorkflowExecutor();
const result = await executor.executeWorkflow('./workflows/weibo-homepage-workflow.json', {
  maxScrolls: 30,
  includeTrending: false,
  includeFeed: true
});
```

### History Management
```typescript
import { DownloadHistoryManagerOperation } from './src/operations/weibo/DownloadHistoryManagerOperation.js';

const historyManager = new DownloadHistoryManagerOperation({
  baseDir: './downloads'
});

// Check if post is already downloaded
const checkResult = await historyManager.execute({
  action: 'check',
  postId: '1234567890',
  folderName: '微博主页',
  baseDir: './downloads'
});

// Clean up orphaned records
await historyManager.execute({
  action: 'cleanup',
  baseDir: './downloads'
});
```

## 📦 Installation & Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start development mode
npm run dev
```

## 🔧 Configuration

### Environment Variables
```bash
# Override default settings
WEBAUTO_BASE_DIR=./downloads
WEBAUTO_MAX_WORKERS=4
WEBAUTO_LOG_LEVEL=info
WEBAUTO_ENABLE_METRICS=true
```

### Configuration Files
Configuration can be provided through JSON files, environment variables, or programmatically:

```json
{
  "baseDir": "./downloads",
  "maxWorkers": 4,
  "logLevel": "info",
  "enableMetrics": true,
  "enableWebSocket": true,
  "defaultTimeout": 300000,
  "retryAttempts": 3,
  "healthCheckInterval": 30000
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test
npm test -- --testNamePattern="SinglePostDownload"

# Type checking
npm run typecheck

# Linting
npm run lint
```

## 📊 Monitoring & Observability

### Health Checks
The framework provides comprehensive health checking:
- System resource monitoring
- Operation success rates
- Worker pool status
- Configuration validation

### Metrics Collection
- CPU and memory usage
- Operation execution times
- Success/failure rates
- Queue lengths and throughput

### Logging
Structured logging with multiple levels:
- `error`: Critical errors
- `warn`: Warning conditions
- `info`: General information
- `debug`: Detailed debugging information
- `browser`: Browser-specific events

## 🎯 Use Cases

### 1. Web Scraping & Content Extraction
- Extract content from social media platforms
- Scrape e-commerce product information
- Collect news articles and blog posts
- Monitor website changes and updates

### 2. Batch Data Processing
- Process large volumes of URLs
- Extract and transform data
- Generate reports and summaries
- Archive web content

### 3. Automated Testing
- Web application testing
- Performance monitoring
- Content validation
- Regression testing

### 4. Content Management
- Organize downloaded content
- Generate metadata and summaries
- Maintain download history
- Clean up orphaned files

## 🔄 Integration Examples

### With Browser Automation
```typescript
import { BrowserOperations } from './src/micro-operations/BrowserOperations.js';

const browserOps = new BrowserOperations();
await browserOps.execute({
  action: 'navigate',
  url: 'https://weibo.com'
});

const content = await browserOps.execute({
  action: 'extractContent',
  selector: '.WB_feed .WB_detail'
});
```

### With File Operations
```typescript
import { FileOperations } from './src/micro-operations/FileOperations.js';

const fileOps = new FileOperations();
await fileOps.execute({
  action: 'save',
  content: data,
  path: './downloads/post.json',
  format: 'json'
});
```

## 🛠️ Development

### Project Structure
```
src/
├── core/                          # Core framework components
│   ├── BaseOperation.ts           # Base operation class
│   ├── OperationRegistry.ts       # Operation management
│   ├── WorkerPool.ts              # Worker thread management
│   ├── TaskOrchestrator.ts        # Task coordination
│   ├── Scheduler.ts               # Scheduling system
│   ├── CommunicationManager.ts    # Inter-component communication
│   ├── ConfigManager.ts           # Configuration management
│   └── ResourceMonitor.ts         # Resource monitoring
├── operations/                    # Specialized operations
│   ├── weibo/                     # Weibo-specific operations
│   │   ├── SinglePostDownloadOperation.js
│   │   ├── DownloadHistoryManagerOperation.js
│   │   └── DownloadSummaryOperation.js
│   └── batch/                     # Batch processing operations
├── micro-operations/              # Atomic operations
│   ├── BrowserOperations.ts
│   ├── NavigationOperations.ts
│   ├── ExtractionOperations.ts
│   ├── FileOperations.ts
│   └── ... (other micro-operations)
├── execution/                     # Execution context management
├── control-flow/                  # Control flow operations
├── generic/                       # Generic reusable operations
├── post-processing/               # Post-processing operations
├── utils/                         # Utility functions
├── config/                        # Configuration management
├── types/                         # Type definitions
├── cli/                           # Command-line interface
├── workers/                       # Worker implementations
└── abstraction/                   # Abstraction layer
workflows/                         # Pre-configured workflows
├── weibo-homepage-workflow.json
├── weibo-search-workflow.json
├── weibo-user-profile-workflow.json
└── weibo-batch-download-workflow.json
```

### Creating Custom Operations
```typescript
import { BaseOperation } from './src/core/BaseOperation.js';

class CustomOperation extends BaseOperation {
  constructor(config = {}) {
    super('custom-operation', config);
    this.category = 'custom';
    this.capabilities = ['custom-processing'];
  }

  async execute(context = {}) {
    this.logger.info('Executing custom operation');

    try {
      // Custom operation logic
      const result = await this.processData(context);

      return {
        success: true,
        data: result,
        executionTime: Date.now() - this.startTime
      };
    } catch (error) {
      this.logger.error('Custom operation failed:', error);
      throw error;
    }
  }

  async processData(context) {
    // Implement custom processing logic
    return { processed: true, data: context.data };
  }
}
```

## 📝 Best Practices

### 1. Operation Design
- Keep operations focused on single responsibilities
- Use abstract categories for operation classification
- Implement proper error handling and logging
- Support configuration through constructor parameters

### 2. Workflow Configuration
- Use descriptive names for workflow steps
- Include proper error handling and recovery
- Configure appropriate timeouts and retry logic
- Document step dependencies and requirements

### 3. Resource Management
- Monitor system resource usage
- Implement proper cleanup and resource release
- Use worker pools for concurrent execution
- Configure appropriate timeouts and limits

### 4. Error Handling
- Implement comprehensive error recovery
- Use appropriate retry logic with backoff
- Log detailed error information for debugging
- Provide graceful degradation when possible

## 🔍 Troubleshooting

### Common Issues

#### Operation Execution Failures
```bash
# Check operation status
npm run cli health

# View detailed logs
npm run cli logs --follow

# Validate configuration
npm run cli config --validate
```

#### Performance Issues
```bash
# Monitor resource usage
npm run cli health

# Adjust worker count
export WEBAUTO_MAX_WORKERS=8

# Check for memory leaks
npm run test:coverage
```

#### File System Issues
```bash
# Clean up orphaned files
npm run cli cleanup --orphaned

# Check disk space
npm run cli health

# Verify file permissions
ls -la downloads/
```

## 📋 Version History

### v1.0.0 (Current)
- Initial release with micro-operations architecture
- Weibo-specific operations and workflows
- Download history management
- Smart directory naming and deduplication
- Comprehensive error handling and monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Implement your operation or enhancement
4. Add appropriate tests and documentation
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the workflow examples
- Join our community discussions

## 📄 License

MIT License - see LICENSE file for details.

---

**Built with ❤️ for robust web automation workflows**