/**
 * OpenAI Compatible Providers Framework Entry Point
 * OpenAI兼容Providers框架入口点
 */

// Framework classes
export { default as BaseProvider } from './framework/BaseProvider';

// OpenAI interface
export * from './framework/OpenAIInterface';

// Qwen provider
export { default as QwenProvider } from './providers/qwen';

// iFlow provider
export { default as IFlowProvider } from './providers/iflow';

// Version info
export const version = '1.0.0';
export const name = 'OpenAI Compatible Providers Framework';