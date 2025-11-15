# Executable Container Module

Provides sandboxed execution environments for web automation scripts and operations.

## Structure

- **inpage/** - In-page script execution and injection
- **node/** - Node.js-based execution environments
- **schemas/** - Execution schemas and validation

## Key Components

### In-Page Execution
- Script injection into web pages
- DOM manipulation utilities
- Event handling in page context
- Secure sandbox environment

### Node Execution
- Node.js script execution
- File system access
- Network request handling
- Process management

### Schemas
- Execution configuration schemas
- Security validation rules
- Permission definitions
- Resource limits

## Features

- Isolated execution environment
- Resource usage monitoring
- Security sandboxing
- Permission-based access control
- Cross-context communication
- Error handling and recovery

## Usage

The executable container provides secure environments for running automation scripts with controlled access to system resources.

```typescript
import { InPageContainer } from './inpage';
import { NodeContainer } from './node';

const container = new InPageContainer(page);
await container.execute(script, permissions);
```
