# Analyzer Module

Provides page analysis and content extraction capabilities for web automation.

## Structure

- **core/** - Core analysis engine and utilities
- **strategies/** - Platform-specific analysis strategies
- **types/** - TypeScript type definitions
- **examples/** - Usage examples and demos
- **tests/** - Test files and test utilities

## Key Components

### Core Analysis Engine
- PageAnalyzer - Main page analysis functionality
- Content extraction utilities
- DOM analysis helpers

### Analysis Strategies
Platform-specific implementations for:
- Content type detection
- Structure analysis
- Element classification
- Data extraction patterns

### Type Definitions
Comprehensive TypeScript interfaces for:
- Analysis results
- Content types
- Strategy configurations
- Extraction patterns

## Usage

The analyzer module provides intelligent content analysis capabilities that can be used across different web platforms and automation workflows.

```typescript
import { PageAnalyzer } from './PageAnalyzer';

const analyzer = new PageAnalyzer();
const result = await analyzer.analyze(page);
```
