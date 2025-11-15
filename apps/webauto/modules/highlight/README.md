# Highlight Module

Provides content highlighting and visual annotation capabilities for web pages.

## Features

- Element highlighting and selection
- Visual annotation overlays
- Interactive element marking
- Custom highlight styles
- Multi-element selection
- Highlight persistence

## Components

- HighlightEngine - Core highlighting functionality
- StyleManager - Style and theme management
- AnnotationManager - Annotation overlay system
- SelectionManager - Element selection utilities

## Usage

The highlight module enables visual identification and annotation of web page elements during automation workflows.

```typescript
import { HighlightEngine } from './HighlightEngine';

const highlighter = new HighlightEngine(page);
await highlighter.highlightElement(selector, style);
```

## Applications

- Element identification during recording
- Visual feedback during execution
- Debugging and inspection
- User interface annotation
- Step-by-step guidance
