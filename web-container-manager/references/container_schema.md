# Container Schema Specification

This document defines the data structure and schema for web element containers used in the Web Container Manager skill.

## Core Data Structure

### Container Object

```yaml
container:
  container_id: string          # Unique identifier (UUID)
  selector: string             # CSS selector for the element
  page_url: string             # Source page URL
  operation: string           # Operation type (monitor, interact, extract, etc.)
  parent_id: string | null    # Parent container ID (null for root containers)
  children: string[]          # List of child container IDs
  metadata: object            # Container metadata
```

### Metadata Object

```yaml
metadata:
  created_at: string          # ISO timestamp of creation
  last_updated: string        # ISO timestamp of last update
  last_accessed: string | null # ISO timestamp of last access
  access_count: number         # Number of times container was accessed
  status: string             # Container status (active, inactive, error)
  tags: string[]             # User-defined tags
  description: string | null  # User description
  priority: number           # Priority level (1-10)
  custom_fields: object      # Additional custom fields
```

## Storage Structure

### Root Storage File

```yaml
storage:
  containers: object          # All container objects keyed by container_id
  root_containers: string[]    # List of root container IDs
  last_updated: string         # Global last updated timestamp
  version: string             # Schema version
```

## Operation Types

### Monitor Operation
```yaml
monitor:
  frequency: string           # Check frequency (e.g., "5s", "1m", "1h")
  change_detection: string    # Type of change detection (content, structure, attributes)
  notifications: boolean       # Whether to send notifications on changes
  thresholds: object          # Thresholds for triggering alerts
```

### Interact Operation
```yaml
interact:
  allowed_actions: string[]    # Allowed actions (click, type, scroll, etc.)
  interaction_delay: number    # Delay between interactions (ms)
  retry_attempts: number       # Number of retry attempts on failure
  validation_rules: object    # Rules for validating interaction results
```

### Extract Operation
```yaml
extract:
  data_type: string           # Type of data to extract (text, attributes, html)
  extraction_rules: object     # Rules for data extraction
  output_format: string        # Output format (json, csv, xml)
  schedule: string           # Extraction schedule (cron-like)
```

### Validate Operation
```yaml
validate:
  validation_rules: object    # Validation rules and conditions
  error_handling: string       # How to handle validation errors
  reporting: boolean          # Whether to generate validation reports
  thresholds: object          # Validation thresholds
```

### Transform Operation
```yaml
transform:
  transformation_type: string  # Type of transformation (css, content, structure)
  transformation_rules: object # Rules for transformation
  preview_mode: boolean        # Whether to show preview before applying
  rollback_enabled: boolean    # Whether rollback is possible
```

### Observe Operation
```yaml
observe:
  events: string[]            # Events to observe (click, hover, focus, etc.)
  event_handlers: object       # Event handler definitions
  recording: boolean           # Whether to record events
  analytics: boolean          # Whether to collect analytics
```

## Selector Types

### CSS Selectors
```yaml
css_selector:
  type: "css"
  value: string              # CSS selector string
  specificity: number        # Selector specificity score
  stability: string          # Stability rating (high, medium, low)
```

### XPath Selectors
```yaml
xpath_selector:
  type: "xpath"
  value: string              # XPath expression
  robustness: number         # Robustness score
  fallback: string           # Fallback CSS selector
```

### Attribute Selectors
```yaml
attribute_selector:
  type: "attribute"
  attribute: string          # Attribute name
  value: string             # Attribute value
  operator: string           # Comparison operator (=, !=, ^=, $=, *=)
  case_sensitive: boolean    # Whether matching is case sensitive
```

## Hierarchy Rules

### Parent-Child Relationships
- A container can have multiple children
- A container can have at most one parent
- Root containers have no parent
- Circular references are not allowed
- Maximum depth: 10 levels

### Inheritance Rules
```yaml
inheritance:
  operations: boolean         # Children inherit parent operations (optional)
  metadata: boolean          # Children inherit parent metadata fields
  settings: boolean          # Children inherit parent settings
  permissions: boolean       # Children inherit parent permissions
```

## Validation Rules

### Selector Validation
```yaml
selector_validation:
  syntax_check: boolean       # Validate selector syntax
  existence_check: boolean    # Verify element exists on page
  uniqueness_check: boolean  # Check for unique element identification
  stability_check: boolean    # Assess selector stability over time
```

### Container Validation
```yaml
container_validation:
  required_fields: string[]    # List of required fields
  field_types: object         # Expected field types
  value_constraints: object   # Value constraints and validations
  business_rules: object       # Business logic validations
```

## Error Handling

### Error Types
```yaml
error_types:
  selector_not_found:         # Element not found for selector
  invalid_operation:          # Invalid operation type
  circular_reference:         # Circular hierarchy reference
  storage_error:             # Storage operation failed
  validation_error:          # Validation rules failed
  permission_denied:         # Insufficient permissions
```

### Error Response Structure
```yaml
error_response:
  error_code: string          # Machine-readable error code
  error_message: string       # Human-readable error message
  error_details: object       # Detailed error information
  suggestions: string[]       # Suggested fixes
  retry_possible: boolean     # Whether operation can be retried
```

## Performance Considerations

### Indexing
- Container IDs are indexed for fast lookups
- Selectors are indexed for existence checking
- Page URLs are indexed for container grouping
- Parent-child relationships are indexed for hierarchy traversal

### Caching
- DOM snapshots are cached for selector validation
- Container hierarchies are cached for quick display
- Recent operations are cached for performance
- Analytics data is cached for reporting

### Limits
- Maximum containers per page: 1000
- Maximum container depth: 10 levels
- Maximum selector length: 256 characters
- Maximum metadata size: 10KB per container
