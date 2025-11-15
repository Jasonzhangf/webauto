/**
 * WebAuto Workflow Engine - Main Entry Point
 * @package @webauto/workflow-engine
 */

// Core workflow components
export { WorkflowEngine } from './WorkflowEngine';
export { ConfigManager } from './ConfigManager';
export { WorkflowContext } from './WorkflowContext';

// Types and interfaces
export * from './types/WorkflowTypes';

// Simple operators
export { BrowserOperator } from '../operators/simple/BrowserOperator';
export { CookieOperator } from '../operators/simple/CookieOperator';
export { NavigationOperator } from '../operators/simple/NavigationOperator';

// Version information
export const WORKFLOW_ENGINE_VERSION = '1.0.0';
export const WORKFLOW_ENGINE_NAME = 'WebAuto Workflow Engine';

// Convenience function to create a workflow engine
export function createWorkflowEngine(config?: { retryPolicy?: any }): WorkflowEngine {
  return new WorkflowEngine(config);
}

// Convenience function to create a config manager
export function createConfigManager(): ConfigManager {
  return new ConfigManager();
}

// Default workflow configurations
export const DEFAULT_WORKFLOW_CONFIGS = {
  basicBrowser: {
    id: 'basic-browser-workflow',
    name: 'Basic Browser Workflow',
    description: 'A simple workflow that starts browser and navigates to a page',
    version: '1.0.0',
    steps: [
      {
        id: 'start-browser',
        name: 'Start Browser',
        operator: 'browser',
        params: {
          action: 'start',
          headless: false,
          viewport: { width: 1920, height: 1080 }
        }
      },
      {
        id: 'navigate',
        name: 'Navigate to Page',
        operator: 'navigation',
        params: {
          action: 'navigate',
          url: 'https://example.com',
          timeout: 30000
        }
      }
    ]
  },

  cookieManager: {
    id: 'cookie-manager-workflow',
    name: 'Cookie Manager Workflow',
    description: 'A workflow that loads cookies and manages browser sessions',
    version: '1.0.0',
    steps: [
      {
        id: 'start-browser',
        name: 'Start Browser',
        operator: 'browser',
        params: {
          action: 'start',
          headless: false,
          viewport: { width: 1920, height: 1080 }
        }
      },
      {
        id: 'load-cookies',
        name: 'Load Cookies',
        operator: 'cookie',
        params: {
          action: 'load',
          path: './cookies.json'
        }
      },
      {
        id: 'navigate',
        name: 'Navigate to Page',
        operator: 'navigation',
        params: {
          action: 'navigate',
          url: 'https://weibo.com',
          timeout: 30000
        }
      },
      {
        id: 'save-cookies',
        name: 'Save Cookies',
        operator: 'cookie',
        params: {
          action: 'save',
          path: './cookies.json'
        }
      }
    ]
  }
};

// Utility functions
export const WorkflowUtils = {
  /**
   * Create a simple workflow configuration
   */
  createWorkflowConfig(id: string, name: string, steps: any[]) {
    return {
      id,
      name,
      version: '1.0.0',
      steps
    };
  },

  /**
   * Add a step to workflow configuration
   */
  addStep(workflow: any, step: any) {
    if (!workflow.steps) {
      workflow.steps = [];
    }
    workflow.steps.push(step);
    return workflow;
  },

  /**
   * Validate workflow configuration
   */
  validateWorkflow(workflow: any) {
    const errors = [];

    if (!workflow.id) errors.push('Workflow ID is required');
    if (!workflow.name) errors.push('Workflow name is required');
    if (!Array.isArray(workflow.steps)) errors.push('Steps must be an array');

    workflow.steps?.forEach((step: any, index: number) => {
      if (!step.id) errors.push(`Step ${index}: ID is required`);
      if (!step.name) errors.push(`Step ${index}: Name is required`);
      if (!step.operator) errors.push(`Step ${index}: Operator is required`);
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
};