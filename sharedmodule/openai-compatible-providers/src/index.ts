/**
 * OpenAI Compatible Providers Framework Entry Point
 * OpenAI兼容Providers框架入口点
 */

// Enhanced base modules
export { PipelineBaseModule, PipelineModuleConfig } from './modules/PipelineBaseModule';

// Framework classes
export { default as BaseProvider } from './framework/BaseProvider';

// Scheduling system
export { Pipeline } from './framework/Pipeline';
export { PipelineFactory } from './framework/PipelineFactory';
export { PipelineScheduler } from './framework/PipelineScheduler';
export { VirtualModelSchedulerManager } from './framework/VirtualModelSchedulerManager';

// Pipeline tracking
export { PipelineTracker } from './framework/PipelineTracker';

// OpenAI interface
export * from './framework/OpenAIInterface';

// Qwen provider
export { default as QwenProvider } from './providers/qwen';

// iFlow provider
export { default as IFlowProvider } from './providers/iflow';

// Operation-based pipeline system (NEW)
export {
  OperationBasedPipelineSystem,
  PipelineBaseOperation,
  RequestTrackingPipelineOperation,
  PipelineSchedulingOperation,
  PipelineWorkflowEngine,
  PipelineOperationRegistry
} from './operations';

// Operation interfaces
export * from './operations/interfaces/IPipelineOperation';

// Version info
export const version = '2.0.0';
export const name = 'OpenAI Compatible Providers Framework with Operation-Based Architecture';

// Architecture info
export const architecture = {
  type: 'hybrid',
  description: 'Combined traditional pipeline framework with operation-based architecture',
  originalComponents: [
    'PipelineBaseModule',
    'BaseProvider',
    'PipelineScheduler',
    'PipelineTracker',
    'QwenProvider',
    'IFlowProvider'
  ],
  operationBasedComponents: [
    'OperationBasedPipelineSystem',
    'PipelineBaseOperation',
    'RequestTrackingPipelineOperation',
    'PipelineSchedulingOperation',
    'PipelineWorkflowEngine',
    'PipelineOperationRegistry'
  ]
};