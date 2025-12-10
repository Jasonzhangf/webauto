# Container Operations Reference

This document provides detailed information about available container operations and their usage.

## Operation Overview

Each container operation defines how the system interacts with the mapped web element. Operations determine the behavior, monitoring, and data processing for each container.

## Monitor Operation

### Description
Tracks changes to the element over time and provides notifications when changes are detected.

### Use Cases
- Content monitoring: Track text changes, additions, deletions
- Structure monitoring: Detect DOM structure changes
- Attribute monitoring: Monitor attribute value changes
- Style monitoring: Track CSS changes

### Parameters
```yaml
monitor:
  frequency: "30s"                    # Check frequency (seconds, minutes, hours)
  change_detection: "content"         # What to monitor (content, structure, attributes, style, all)
  notifications: true                 # Send notifications on changes
  thresholds:
    content_change_threshold: 0.1     # Percentage change to trigger alert (0.0-1.0)
    structure_change_threshold: 1     # Number of structural changes
    attribute_change_threshold: 1     # Number of attribute changes
  filters:
    ignored_attributes: ["data-time"] # Attributes to ignore
    ignored_content: []               # Content patterns to ignore
    whitelist_only: false             # Only monitor whitelisted attributes
```

### Examples
```yaml
# Monitor news headline
selector: "h1.headline"
operation: monitor
parameters:
  frequency: "5m"
  change_detection: "content"
  notifications: true
  thresholds:
    content_change_threshold: 0.5

# Monitor shopping cart count
selector: ".cart-count"
operation: monitor
parameters:
  frequency: "10s"
  change_detection: "content"
  notifications: true
  thresholds:
    content_change_threshold: 1.0
```

## Interact Operation

### Description
Enables programmatic interaction with the element, including clicking, typing, and form submission.

### Use Cases
- Automated form filling
- Button clicking
- Navigation
- User simulation

### Parameters
```yaml
interact:
  allowed_actions: ["click", "type"]  # Permitted interaction types
  interaction_delay: 500              # Delay between interactions (ms)
  retry_attempts: 3                   # Number of retry attempts
  validation_rules:
    validate_result: true              # Validate interaction results
    expected_outcome: "navigation"     # Expected outcome type
    timeout: 5000                      # Interaction timeout (ms)
  safety:
    confirm_dangerous: true            # Confirm dangerous actions
    rate_limit: "1s"                   # Minimum delay between interactions
    max_interactions: 10               # Maximum interactions per session
```

### Examples
```yaml
# Click login button
selector: "button#login"
operation: interact
parameters:
  allowed_actions: ["click"]
  interaction_delay: 1000
  retry_attempts: 2
  validation_rules:
    expected_outcome: "navigation"
    timeout: 3000

# Fill search form
selector: "input#search"
operation: interact
parameters:
  allowed_actions: ["focus", "type", "submit"]
  interaction_delay: 300
  retry_attempts: 1
```

## Extract Operation

### Description
Extracts data from the element on a regular schedule or on-demand.

### Use Cases
- Price monitoring
- Content scraping
- Data collection
- Report generation

### Parameters
```yaml
extract:
  data_type: "text"                   # Type of data to extract
  extraction_rules:
    format: "structured"               # Extraction format
    clean_whitespace: true             # Clean whitespace
    extract_html: false                # Include HTML in output
    extract_attributes: ["href"]       # Attributes to extract
  output_format: "json"               # Output format (json, csv, xml)
  schedule: "0 9 * * *"               # Extraction schedule (cron format)
  data_processing:
    transformations: []                # Data transformations to apply
    filters: []                        # Data filters
    aggregations: []                   # Data aggregations
  storage:
    max_records: 1000                  # Maximum records to store
    retention_days: 30                 # Data retention period
    compression: true                  # Compress stored data
```

### Examples
```yaml
# Extract product prices
selector: ".price"
operation: extract
parameters:
  data_type: "text"
  extraction_rules:
    format: "structured"
    clean_whitespace: true
  output_format: "json"
  schedule: "0 * * * *"  # Every hour

# Extract article content
selector: "article.content"
operation: extract
parameters:
  data_type: "text"
  extraction_rules:
    format: "structured"
    extract_html: false
  output_format: "json"
  schedule: "0 8 * * *"  # Daily at 8 AM
```

## Validate Operation

### Description
Validates the element state, content, and properties against defined rules.

### Use Cases
- Content validation
- State verification
- Quality assurance
- Error detection

### Parameters
```yaml
validate:
  validation_rules:
    required_content: []               # Required content patterns
    forbidden_content: []              # Forbidden content patterns
    min_length: 10                     # Minimum content length
    max_length: 1000                   # Maximum content length
    required_attributes: {}            # Required attributes and values
    forbidden_attributes: {}           # Forbidden attributes and values
    css_validations: {}                # CSS property validations
  error_handling:
    on_error: "report"                 # Error handling strategy
    retry_validation: true             # Retry validation on failure
    max_retries: 3                     # Maximum retry attempts
  reporting:
    generate_report: true              # Generate validation reports
    report_frequency: "daily"          # Report generation frequency
    include_screenshots: true          # Include screenshots in reports
  thresholds:
    error_threshold: 5                 # Number of errors before alert
    warning_threshold: 3               # Number of warnings before alert
    success_rate_threshold: 0.95       # Required success rate
```

### Examples
```yaml
# Validate form input
selector: "input#email"
operation: validate
parameters:
  validation_rules:
    required_content: ["@", "."]
    min_length: 5
    max_length: 100
  error_handling:
    on_error: "report"
    retry_validation: true

# Validate page title
selector: "title"
operation: validate
parameters:
  validation_rules:
    required_content: ["Company Name"]
    min_length: 10
  reporting:
    generate_report: true
    report_frequency: "daily"
```

## Transform Operation

### Description
Applies transformations to the element, including style changes, content modifications, and structural alterations.

### Use Cases
- Style modifications
- Content enhancement
- Element reordering
- Dynamic updates

### Parameters
```yaml
transform:
  transformation_type: "css"           # Type of transformation
  transformation_rules:
    css_modifications: {}              # CSS property changes
    content_replacements: {}           # Content replacement rules
    attribute_modifications: {}        # Attribute modifications
    structural_changes: {}             # DOM structure changes
  preview_mode: true                   # Show preview before applying
  rollback_enabled: true               # Allow rollback of changes
  safety:
    confirm_dangerous: true            # Confirm dangerous transformations
    backup_original: true              # Backup original state
    max_transformations: 10            # Maximum transformations per session
  validation:
    validate_output: true              # Validate transformation results
    expected_result: "enhancement"     # Expected transformation outcome
    rollback_on_error: true            # Rollback on validation failure
```

### Examples
```yaml
# Highlight important elements
selector: ".important"
operation: transform
parameters:
  transformation_type: "css"
  transformation_rules:
    css_modifications:
      backgroundColor: "yellow"
      fontWeight: "bold"
  preview_mode: true
  rollback_enabled: true

# Replace content
selector: ".outdated-info"
operation: transform
parameters:
  transformation_type: "content"
  transformation_rules:
    content_replacements:
      "old text": "new text"
  preview_mode: true
  rollback_enabled: true
```

## Observe Operation

### Description
Observes and records user interactions and events on the element.

### Use Cases
- User behavior analysis
- Event tracking
- Analytics collection
- Performance monitoring

### Parameters
```yaml
observe:
  events: ["click", "hover", "focus"]  # Events to observe
  event_handlers:
    on_click: "log_and_report"           # Click event handler
    on_hover: "track_duration"           # Hover event handler
    on_focus: "measure_time"             # Focus event handler
  recording:
    record_events: true                  # Record event details
    include_timestamps: true             # Include timestamps
    include_user_data: false             # Include user data (privacy)
    max_events: 10000                    # Maximum events to record
  analytics:
    collect_analytics: true              # Collect analytics data
    analytics_type: "behavioral"         # Type of analytics
    reporting_interval: "hourly"         # Analytics reporting interval
  privacy:
    anonymize_data: true                 # Anonymize collected data
    respect_dnt: true                    # Respect Do Not Track headers
    data_retention: "30d"                # Data retention period
```

### Examples
```yaml
# Track button clicks
selector: "button.cta"
operation: observe
parameters:
  events: ["click"]
  recording:
    record_events: true
    include_timestamps: true
  analytics:
    collect_analytics: true
    analytics_type: "behavioral"

# Monitor form interactions
selector: "form#contact"
operation: observe
parameters:
  events: ["focus", "blur", "change", "submit"]
  recording:
    record_events: true
    include_timestamps: true
  privacy:
    anonymize_data: true
    respect_dnt: true
```

## Operation Selection Guide

### Content-Focused Operations
- **Monitor**: When you need to track changes to content over time
- **Extract**: When you need to regularly collect data from the element
- **Validate**: When you need to ensure content meets specific criteria

### Interaction-Focused Operations
- **Interact**: When you need to programmatically interact with the element
- **Observe**: When you need to track user interactions and behavior

### Modification-Focused Operations
- **Transform**: When you need to modify the element's appearance or content
- **Monitor**: When you need to validate changes made by transformations

### Multi-Operation Scenarios

#### E-commerce Price Monitoring
```yaml
# Monitor price changes
selector: ".price"
operation: monitor
parameters:
  frequency: "1h"
  change_detection: "content"
  notifications: true

# Extract price data
selector: ".price"
operation: extract
parameters:
  data_type: "text"
  schedule: "0 */6 * * *"  # Every 6 hours
  output_format: "json"
```

#### Form Validation
```yaml
# Validate form inputs
selector: "input[type='email']"
operation: validate
parameters:
  validation_rules:
    required_content: ["@", "."]
    min_length: 5

# Observe form interactions
selector: "form#registration"
operation: observe
parameters:
  events: ["submit", "focus", "blur"]
  recording:
    record_events: true
```

## Best Practices

### Operation Selection
1. Choose the operation that best matches your use case
2. Consider combining operations for complex scenarios
3. Start with conservative parameters and adjust as needed
4. Monitor operation performance and resource usage

### Parameter Configuration
1. Set appropriate frequencies to balance responsiveness and resource usage
2. Configure meaningful thresholds to avoid false positives
3. Use validation rules to ensure data quality
4. Enable rollback options for transformation operations

### Error Handling
1. Configure retry mechanisms for reliability
2. Set up error reporting and notifications
3. Implement fallback strategies for critical operations
4. Monitor operation success rates and adjust parameters

### Performance Optimization
1. Use efficient selectors to minimize DOM traversal
2. Batch operations when possible to reduce overhead
3. Cache frequently accessed data
4. Monitor resource usage and optimize as needed
