---
name: web-container-manager
description: This skill should be used when users want to manage and map web page DOM elements to container hierarchies interactively. It provides tools for browser automation, DOM element selection, container creation/modification/deletion, and maintaining mapping relationships between page elements and local container structures.
license: Complete terms in LICENSE.txt
---

# Web Container Manager

This skill enables interactive management of web page DOM elements and their mapping to local container hierarchies. It combines browser automation, DOM analysis, and user interaction to create a flexible container management system.

## When to Use This Skill

Use this skill when:
- Opening a web page and analyzing its DOM structure
- Creating or modifying container mappings between DOM elements and local storage
- Interactively selecting page elements with mouse hover and click
- Managing container hierarchies (create, modify, delete operations)
- Comparing selectors against existing container mappings
- Establishing root containers and parent-child relationships

## Core Workflow

### 1. Browser Page Analysis

**Open and analyze web pages:**
- Use Chrome DevTools to navigate to the target URL
- Take DOM snapshots to analyze page structure
- Identify potential root containers for mapping

**Check existing container mappings:**
- Compare page DOM against local container storage
- Determine if root containers already exist
- Present options for container creation or modification

### 2. Interactive Container Creation

**Selector-based container creation:**
- Accept user-provided CSS selectors
- Validate selectors against the current page DOM
- Check for existing container mappings
- Find nearest parent container for hierarchy placement
- Prompt for container operation type

**Available container operations:**
- `monitor` - Track element changes and updates
- `interact` - Enable user interactions with the element
- `extract` - Extract data from the element
- `validate` - Validate element state and content
- `transform` - Apply transformations to the element
- `observe` - Observe events on the element

### 3. Visual Element Selection

**Enter selection mode:**
- Enable hover highlighting for elements
- Show element boundaries and basic information on hover
- Capture click events for element selection
- Exit selection mode after element selection

**Element selection process:**
- Highlight smallest meaningful element boundaries
- Display element tag, class, and ID information
- Capture user click to finalize selection
- Suggest parent container relationships

### 4. Container Management Operations

**Container creation:**
- Validate element existence on page
- Determine optimal parent container
- Establish container metadata and operations
- Store container mapping information

**Container modification:**
- Update container operations and metadata
- Modify parent-child relationships
- Handle conflicting mappings

**Container deletion:**
- Identify target container for deletion
- Handle child container reassignment
- Clean up mapping relationships
- Confirm deletion with user

### 5. Container Hierarchy Display

**List root containers:**
- Display all available root containers
- Show container metadata and operations
- Present hierarchical relationships

**Display container details:**
- Show selector information
- Display associated operations
- List child containers and their relationships

## Implementation Details

### Container Storage Structure

Use `references/container_schema.md` for container data structure specifications:
```yaml
root_containers:
  - container_id: unique_identifier
    selector: "css_selector"
    page_url: "source_page_url"
    operations: [operation_list]
    children: [child_container_ids]
    metadata:
      created_at: timestamp
      last_updated: timestamp
```

### Browser Integration

Use `scripts/browser_manager.py` for browser automation:
- Page navigation and DOM analysis
- Element selection and highlighting
- Screenshot capture for visual feedback
- Console message handling for debugging

### Container Operations

Implement in `scripts/container_manager.py`:
- CRUD operations for containers
- Selector validation and comparison
- Hierarchy relationship management
- Persistence layer for container storage

### User Interaction

Implement in `scripts/interaction_handler.py`:
- Command parsing and validation
- Selection mode management
- Visual feedback system
- Confirmation dialogs and user prompts

## Error Handling

**Invalid selectors:**
- Validate selector syntax
- Check selector against page DOM
- Provide suggestions for correction

**Missing elements:**
- Handle dynamic content loading
- Wait for element availability
- Suggest alternative selectors

**Container conflicts:**
- Detect duplicate mappings
- Resolve hierarchy conflicts
- Provide conflict resolution options

## Usage Examples

**Basic container creation:**
1. User provides URL: "ANY_URL"
2. System opens page and analyzes DOM
3. User provides selector: ".main-content"
4. System validates selector and creates container
5. User chooses operation: "monitor"
6. Container is added to hierarchy

**Visual element selection:**
1. User enters selection mode
2. System enables hover highlighting
3. User hovers over elements to preview
4. User clicks to select element
5. System suggests container placement
6. User confirms and provides operation
7. Container is created and mapped

## Resources

- `scripts/browser_manager.py` - Browser automation and DOM interaction
- `scripts/container_manager.py` - Container CRUD and hierarchy management
- `scripts/interaction_handler.py` - User interaction and selection mode
- `references/container_schema.md` - Container data structure specifications
- `references/operations_list.md` - Detailed operation descriptions and parameters
- `assets/selection_styles.css` - CSS for element highlighting and visual feedback
