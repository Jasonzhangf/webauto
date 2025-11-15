# Core Modules

This directory contains the core modules that form the foundation of the web automation system.

## Structure

- **browser/** - Browser automation and control utilities
- **events/** - Event handling and dispatch system
- **nodes/** - Core workflow nodes for automation tasks
- **workflow/** - Workflow execution engine and management

## Key Components

### Browser Module
Handles browser automation, page navigation, and interaction capabilities.

### Events Module
Provides event-driven architecture for communication between components.

### Nodes Module
Contains specialized workflow nodes:
- BrowserOperatorNode - Browser operations
- ConditionalRouterNode - Conditional workflow routing
- CookieManagerNode - Cookie management
- DataIntegratorNode - Data integration and processing
- FileSaverNode - File saving operations
- LinkFilterNode - Link filtering and validation
- NavigationOperatorNode - Page navigation
- RecursiveTreeExtractorNode - Recursive data extraction
- StructuredDataSaverNode - Structured data storage
- WeiboCommentExtractorNode - Weibo comment extraction
- WeiboMediaCaptureNode - Weibo media capture
- WeiboPostAnalyzerNode - Weibo post analysis

### Workflow Module
Workflow orchestration and execution:
- BehaviorRecorder - Records user behaviors
- ContactStore - Contact information storage
- ContainerResolver - Resolves UI containers
- Logger - Logging utilities
- NodeRegistry - Registry for workflow nodes
- SessionFS - Session filesystem management
- SessionRegistry - Session management
- VariableManager - Variable and state management
- WorkflowEngine - Core workflow execution engine
- WorkflowRunner - Workflow execution runner

## Usage

Core modules provide the fundamental building blocks for creating web automation workflows. They are designed to be modular and reusable across different platforms and use cases.
