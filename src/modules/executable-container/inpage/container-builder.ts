import { ExecutableContainerDefinition, ExecutableContainerRuntime } from './types';

export function buildExecutableContainer(selector: string, type: string = 'interactive', website?: string, name?: string): ExecutableContainerDefinition {
  const runtime: ExecutableContainerRuntime = {
    events: [
      { name: 'appear', node: 'EventDrivenOptionalClickNode', params: { selectors: [selector], click: false, highlight: true } },
      { name: 'action:click', node: 'EventDrivenOptionalClickNode', params: { selectors: [selector], click: true, highlight: true } },
    ],
    operations: [
      { key: 'highlight', label: '高亮', event: 'appear' },
      { key: 'click', label: '点击', event: 'action:click' },
      { key: 'copy-selector', label: '复制选择器', node: 'JavaScriptExecutionNode', params: { script: `navigator.clipboard?.writeText(${JSON.stringify(selector)}); return ${JSON.stringify(selector)};` } },
    ],
    flags: { }
  };

  const def: ExecutableContainerDefinition = {
    id: undefined,
    website,
    name,
    selector,
    type,
    priority: 999,
    validation: { selectorValid: true, lastValidation: new Date().toISOString() },
    discovery: { strategy: 'picker', specificityThreshold: 0, waitForElements: false },
    metadata: { discoveredAt: Date.now(), discoveryStrategy: 'picker' },
    runtime,
  };
  return def;
}

