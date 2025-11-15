# Libraries Directory

Shared libraries and reusable components that power the web automation platform.

## Structure

- **actions-system/** - Action execution and management system
- **containers/** - UI container detection and management
- **openai-compatible-providers/** - AI service integrations
- **operations-framework/** - Core operations and workflow framework
- **ui-recognition/** - UI element recognition and analysis
- **workflows/** - Predefined workflow templates

## Key Libraries

### Actions System
Modular action execution framework with:
- Event-driven architecture
- Plugin system
- Error handling
- Action chaining
- State management

### Container Management
UI container detection and analysis:
- DOM container identification
- Element categorization
- Spatial relationship analysis
- Interactive element detection
- Visual pattern recognition

### AI Service Providers
OpenAI-compatible integrations:
- Multiple provider support
- Standardized API interface
- Rate limiting and quota management
- Fallback mechanisms
- Response processing

### Operations Framework
Core automation infrastructure:
- Atomic operations
- Workflow composition
- Error recovery
- Performance monitoring
- Resource management

### UI Recognition
Computer vision for web UI:
- Element detection
- Layout analysis
- Component classification
- Visual similarity matching
- Cross-platform compatibility

### Workflow Library
Reusable workflow templates:
- Common automation patterns
- Platform-specific workflows
- Best practice implementations
- Extensible templates
- Custom workflow builders

## Architecture

Libraries follow a modular architecture with:
- Clear separation of concerns
- Minimal dependencies
- Comprehensive type definitions
- Extensive test coverage
- Performance optimization

## Usage

Libraries are designed to be used independently or combined to create complex automation solutions.

```typescript
import { ActionEngine } from './actions-system';
import { ContainerDetector } from './containers';
import { WorkflowRunner } from './operations-framework';

const engine = new ActionEngine();
const detector = new ContainerDetector();
const runner = new WorkflowRunner();
```
