/**
 * WebAuto Workflow Engine - Configuration Manager
 * @package @webauto/workflow-engine
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  WorkflowConfig,
  OperatorConfig,
  ConfigManager as IConfigManager,
  ValidationResult
} from './types/WorkflowTypes';

export class ConfigManager implements IConfigManager {
  private _workflowSchemas: Map<string, any> = new Map();
  private _operatorLibraries: Map<string, Record<string, OperatorConfig>> = new Map();

  constructor() {
    this.initializeDefaultSchemas();
  }

  /**
   * Load workflow configuration from JSON file
   */
  async loadWorkflow(filePath: string): Promise<WorkflowConfig> {
    try {
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, 'utf-8');
      const config = JSON.parse(content);

      // Validate the configuration
      const validation = this.validateWorkflow(config);
      if (!validation.valid) {
        throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
      }

      return config as WorkflowConfig;
    } catch (error) {
      throw new Error(`Failed to load workflow from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save workflow configuration to JSON file
   */
  async saveWorkflow(workflow: WorkflowConfig, filePath: string): Promise<void> {
    try {
      const absolutePath = path.resolve(filePath);
      const dirPath = path.dirname(absolutePath);

      // Create directory if it doesn't exist
      await fs.mkdir(dirPath, { recursive: true });

      // Validate before saving
      const validation = this.validateWorkflow(workflow);
      if (!validation.valid) {
        throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
      }

      const content = JSON.stringify(workflow, null, 2);
      await fs.writeFile(absolutePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save workflow to ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate workflow configuration
   */
  validateWorkflow(workflow: WorkflowConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!workflow.id || typeof workflow.id !== 'string') {
      errors.push('Workflow ID is required and must be a string');
    }

    if (!workflow.name || typeof workflow.name !== 'string') {
      errors.push('Workflow name is required and must be a string');
    }

    if (!Array.isArray(workflow.steps)) {
      errors.push('Workflow steps must be an array');
    } else {
      workflow.steps.forEach((step, index) => {
        if (!step.id || typeof step.id !== 'string') {
          errors.push(`Step ${index}: ID is required and must be a string`);
        }

        if (!step.name || typeof step.name !== 'string') {
          errors.push(`Step ${index}: Name is required and must be a string`);
        }

        if (!step.operator || typeof step.operator !== 'string') {
          errors.push(`Step ${index}: Operator is required and must be a string`);
        }

        if (step.retry && (typeof step.retry !== 'number' || step.retry < 0)) {
          warnings.push(`Step ${index}: Retry count should be a positive number`);
        }

        if (step.timeout && (typeof step.timeout !== 'number' || step.timeout <= 0)) {
          warnings.push(`Step ${index}: Timeout should be a positive number`);
        }
      });
    }

    // Check for duplicate step IDs
    const stepIds = new Set<string>();
    workflow.steps?.forEach((step, index) => {
      if (stepIds.has(step.id)) {
        errors.push(`Step ${index}: Duplicate step ID '${step.id}'`);
      }
      stepIds.add(step.id);
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Load operator library from JSON file
   */
  async loadOperatorLibrary(filePath: string): Promise<Record<string, OperatorConfig>> {
    try {
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, 'utf-8');
      const library = JSON.parse(content);

      // Validate operator library structure
      const validation = this.validateOperatorLibrary(library);
      if (!validation.valid) {
        throw new Error(`Operator library validation failed: ${validation.errors.join(', ')}`);
      }

      this._operatorLibraries.set(filePath, library);
      return library;
    } catch (error) {
      throw new Error(`Failed to load operator library from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a template workflow configuration
   */
  createTemplateWorkflow(template: 'basic-browser' | 'cookie-manager' | 'weibo-scraping'): WorkflowConfig {
    switch (template) {
      case 'basic-browser':
        return {
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
                headless: false,
                viewport: { width: 1920, height: 1080 }
              }
            },
            {
              id: 'navigate',
              name: 'Navigate to Page',
              operator: 'navigation',
              params: {
                url: 'https://example.com',
                timeout: 30000
              }
            }
          ]
        };

      case 'cookie-manager':
        return {
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
        };

      case 'weibo-scraping':
        return {
          id: 'weibo-scraping-workflow',
          name: 'Weibo Scraping Workflow',
          description: 'A workflow for scraping Weibo homepage content',
          version: '1.0.0',
          variables: {
            targetUrl: 'https://weibo.com',
            cookiePath: './cookies.json',
            outputPath: './output/weibo-data.json'
          },
          steps: [
            {
              id: 'start-browser',
              name: 'Start Browser',
              operator: 'browser',
              params: {
                headless: false,
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
              }
            },
            {
              id: 'load-cookies',
              name: 'Load Weibo Cookies',
              operator: 'cookie',
              params: {
                action: 'load',
                path: '${cookiePath}'
              }
            },
            {
              id: 'navigate-weibo',
              name: 'Navigate to Weibo',
              operator: 'navigation',
              params: {
                url: '${targetUrl}',
                timeout: 30000,
                waitFor: '.Feed_body'
              }
            },
            {
              id: 'extract-content',
              name: 'Extract Content',
              operator: 'data',
              params: {
                action: 'extract',
                selector: '.Feed_body',
                output: '${outputPath}'
              }
            },
            {
              id: 'save-cookies',
              name: 'Save Session Cookies',
              operator: 'cookie',
              params: {
                action: 'save',
                path: '${cookiePath}'
              }
            }
          ]
        };

      default:
        throw new Error(`Unknown template: ${template}`);
    }
  }

  /**
   * Get available workflow templates
   */
  getAvailableTemplates(): string[] {
    return ['basic-browser', 'cookie-manager', 'weibo-scraping'];
  }

  /**
   * Get loaded operator libraries
   */
  getOperatorLibraries(): Map<string, Record<string, OperatorConfig>> {
    return new Map(this._operatorLibraries);
  }

  /**
   * Validate operator library structure
   */
  private validateOperatorLibrary(library: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof library !== 'object' || library === null) {
      errors.push('Operator library must be an object');
      return { valid: false, errors, warnings };
    }

    for (const [operatorId, config] of Object.entries(library)) {
      if (typeof config !== 'object' || config === null) {
        errors.push(`Operator '${operatorId}' configuration must be an object`);
        continue;
      }

      if (!config.id || config.id !== operatorId) {
        errors.push(`Operator '${operatorId}': ID mismatch or missing`);
      }

      if (!config.name || typeof config.name !== 'string') {
        errors.push(`Operator '${operatorId}': Name is required and must be a string`);
      }

      if (!config.type || !['browser', 'cookie', 'navigation', 'data', 'control'].includes(config.type)) {
        errors.push(`Operator '${operatorId}': Type must be one of: browser, cookie, navigation, data, control`);
      }

      if (!Array.isArray(config.parameters)) {
        errors.push(`Operator '${operatorId}': Parameters must be an array`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Initialize default schemas
   */
  private initializeDefaultSchemas(): void {
    // Initialize default validation schemas if needed
    this._workflowSchemas.set('basic', {
      type: 'object',
      required: ['id', 'name', 'steps'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        version: { type: 'string' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'operator'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              operator: { type: 'string' },
              params: { type: 'object' },
              condition: { type: 'string' },
              retry: { type: 'number', minimum: 0 },
              timeout: { type: 'number', minimum: 0 },
              continueOnError: { type: 'boolean' },
              output: { type: 'string' }
            }
          }
        }
      }
    });
  }
}