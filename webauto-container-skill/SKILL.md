---
name: webauto-container-skill
description: This skill should be used when users need intelligent DOM element analysis, container creation and management, and automated workflow generation within the WebAuto container system. It provides Claude with the ability to analyze page elements, create hierarchical container definitions, manage parent-child relationships, and generate container-based automation workflows with full ContainerDefV2 schema compliance and anti-detection integration.
version: "1.0.0"
author: "WebAuto Team"
capabilities: ["dom_analysis", "container_creation", "workflow_generation", "interactive_editing", "anti_detection"]
supported_operations: ["find-child", "click", "type", "scroll", "highlight", "custom"]
---

# WebAuto Container Skill

This skill enables intelligent DOM analysis, container creation, and workflow automation using the WebAuto ContainerDefV2 system.

## Core Capabilities

### DOM Element Analysis
- Analyze page elements and extract CSS classes, attributes, and relationships
- Generate optimal SelectorByClass definitions for ContainerDefV2
- Identify element hierarchies and parent-child relationships
- Detect element capabilities (clickable, inputtable, scrollable)

### Container Creation and Management
- Create ContainerDefV2 definitions from DOM elements
- Manage container hierarchies and relationships
- Configure operations queues with anti-detection integration
- Support all operation types: find-child, click, type, scroll, highlight, custom

### Interactive Container Editing
- Real-time element highlighting and selection
- Container tree visualization and navigation
- Operation queue editing and validation
- Live preview of container changes

### Workflow Generation
- Convert natural language requests to container operations
- Generate multi-step automation workflows
- Integrate anti-detection strategies automatically
- Provide execution feedback and optimization suggestions

## Usage Scenarios

### Element Analysis and Container Creation
Use when user wants to analyze a specific page element and create a container:

```bash
"Analyze the login button on this page and create a container with click operation"
"Find the search input element and create a container that supports text input and highlighting"
"Create a container for the navigation menu with hover and click operations"
```

### Container Management and Editing
Use when user wants to manage existing containers:

```bash
"Show me the container hierarchy for this page"
"Edit the login_form container to add a password input operation"
"Delete the old_banner container and update its parent's children list"
"Update the search container operations to add anti-detection delays"
```

### Workflow Generation and Execution
Use when user wants to create automation workflows:

```bash
"Create a complete login workflow using existing containers"
"Generate a workflow to navigate to profile page and extract user information"
"Create a form-filling workflow with human-like typing simulation"
```

### Interactive Debugging
Use when user needs interactive debugging assistance:

```bash
"Highlight all containers that support click operations"
"Show me which containers failed to execute and why"
"Analyze why the login button container is not being found"
"Run the login_form container with debug logging enabled"
```

## Implementation Architecture

### Element Analysis Pipeline
1. Extract DOM structure and CSS classes
2. Generate SelectorByClass definitions
3. Identify element capabilities and relationships
4. Create ContainerDefV2 schema-compliant definitions

### Container Management System
1. Integration with container-library.json registry
2. Hierarchical relationship management
3. Operation queue validation and optimization
4. Real-time browser session integration

### Anti-Detection Integration
1. Human behavior simulation for all operations
2. Dynamic threat level adaptation
3. Environment fingerprinting and cleanup
4. Request timing and randomization

### Browser Session Management
1. WebSocket integration with browser sessions
2. Real-time element highlighting and interaction
3. Container execution context management
4. Error handling and recovery strategies

## Technical Requirements

### Browser Integration
- WebSocket client for browser session communication
- Real-time DOM query and manipulation
- Element highlighting and selection tools
- Operation execution with feedback loops

### Container System Integration
- ContainerDefV2 schema compliance
- Container registry API integration
- Operation execution engine
- Hierarchy management and validation

### Anti-Detection Features
- Human behavior simulation
- Environment detection and cleanup
- Dynamic strategy adaptation
- Threat level management

### User Interface Features
- Interactive element selection
- Container tree visualization
- Real-time highlighting and feedback
- Operation queue editing interface

## API Integration Points

### Container Registry API
```python
# Load containers for current URL
containers = get_containers_for_url_v2(url)

# Save new container
save_container_v2(site_key, container_def)

# Get container hierarchy
hierarchy = get_container_hierarchy_v2(url)
```

### Browser Session API
```python
# Query DOM elements
elements = await browser_session.query_selector(css_selector)

# Execute operations
await browser_session.evaluate(script)

# Highlight elements
await browser_session.evaluate(highlight_script, selector, duration)
```

### Container Execution API
```python
# Execute container operations
result = await executor.execute_container(container, context)

# Create execution context
context = ContainerExecutionContext(
    session_id=session_id,
    browser_session=browser_session,
    page_url=url,
    container_library=containers,
    anti_detection_enabled=True
)
```

## Error Handling and Recovery

### Element Analysis Errors
- Invalid CSS class extraction
- Selector generation failures
- DOM structure analysis errors
- Container schema validation failures

### Container Management Errors
- Parent-child relationship conflicts
- Operation queue validation failures
- Registry save/load failures
- Browser session disconnections

### Execution Errors
- Element not found
- Operation timeout
- Anti-detection triggers
- Browser session interruptions

## Performance Considerations

### Element Analysis Performance
- Efficient DOM traversal algorithms
- CSS selector optimization
- Cache frequently accessed elements
- Batch DOM queries when possible

### Container Management Performance
- Lazy loading of container definitions
- Incremental hierarchy updates
- Efficient registry operations
- Memory usage optimization

### Execution Performance
- Parallel operation execution where possible
- Anti-detection delay optimization
- Error recovery without full restarts
- Execution state caching

## Security Considerations

### Browser Security
- Safe JavaScript execution contexts
- Input sanitization and validation
- Cross-origin request protection
- Privilege separation for operations

### Container Security
- Container definition validation
- Operation type restrictions
- Malicious script detection
- Safe script execution environment

### Data Security
- Container definition encryption
- Browser session data protection
- User input privacy
- Audit logging for all operations