#!/usr/bin/env node

/**
 * WebAuto Workflow Engine - Universal CLI Runner (Standalone Version)
 * This is a universal CLI runner that uses the standalone workflow engine
 * to execute any workflow configuration without TypeScript dependencies
 */

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// Import the standalone workflow engine
const {
  WorkflowEngine,
  BrowserOperator,
  CookieOperator,
  NavigationOperator
} = require('../demo/workflow-engine-simple.js');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    workflow: null,
    variables: {},
    verbose: false,
    dryRun: false,
    outputFormat: 'text',
    logLevel: 'info',
    validate: false,
    listOperators: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];

      switch (key) {
        case 'workflow':
        case 'w':
          options.workflow = value;
          i++;
          break;
        case 'variable':
        case 'var':
        case 'v':
          if (value && value.includes('=')) {
            const [varName, varValue] = value.split('=', 2);
            options.variables[varName] = varValue;
          }
          i++;
          break;
        case 'verbose':
          options.verbose = true;
          options.logLevel = 'debug';
          break;
        case 'dry-run':
          options.dryRun = true;
          break;
        case 'output':
        case 'o':
          options.outputFormat = value;
          i++;
          break;
        case 'log-level':
          options.logLevel = value;
          i++;
          break;
        case 'validate':
          options.validate = true;
          break;
        case 'list-operators':
          options.listOperators = true;
          break;
        case 'help':
        case 'h':
          showHelp();
          process.exit(0);
          break;
      }
    }
  }

  return options;
}

function showHelp() {
  console.log(`
🎯 WebAuto Workflow Engine - Universal CLI Runner (Standalone)
==============================================================

USAGE:
  node workflow-runner-standalone.js --workflow <path> [options]

OPTIONS:
  -w, --workflow <path>       Path to workflow JSON file (required)
  -v, --variable <key=value>  Set workflow variable (can be used multiple times)
  --verbose                   Enable verbose logging
  --dry-run                   Validate workflow without executing
  -o, --output <format>       Output format: json, text, minimal (default: text)
  --log-level <level>         Log level: debug, info, warn, error (default: info)
  --validate                  Only validate workflow, don't execute
  --list-operators            List available operators
  -h, --help                  Show this help message

EXAMPLES:
  # Execute Weibo workflow
  node workflow-runner-standalone.js --workflow ./weibo-workflow.json

  # Execute with custom variables
  node workflow-runner-standalone.js --workflow ./weibo-workflow.json --variable targetUrl=https://example.com

  # Execute with verbose output
  node workflow-runner-standalone.js --workflow ./weibo-workflow.json --verbose

  # Validate workflow only
  node workflow-runner-standalone.js --workflow ./weibo-workflow.json --validate

  # List available operators
  node workflow-runner-standalone.js --list-operators
  `);
}

function loadVariablesFromFile(variables) {
  // Check if any variable values are file paths (starting with @)
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === 'string' && value.startsWith('@')) {
      const filePath = value.slice(1);
      try {
        if (fsSync.existsSync(filePath)) {
          const fileContent = fsSync.readFileSync(filePath, 'utf-8');
          try {
            variables[key] = JSON.parse(fileContent);
          } catch {
            variables[key] = fileContent.trim();
          }
        } else {
          console.warn(`⚠️  Variable file not found: ${filePath}`);
        }
      } catch (error) {
        console.warn(`⚠️  Error loading variable file: ${error.message}`);
      }
    }
  }
}

// Simple config manager for standalone use
class SimpleConfigManager {
  async loadWorkflow(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  validateWorkflow(workflow) {
    const errors = [];
    const warnings = [];

    if (!workflow.id) errors.push('Workflow ID is required');
    if (!workflow.name) errors.push('Workflow name is required');
    if (!Array.isArray(workflow.steps)) errors.push('Steps must be an array');

    workflow.steps?.forEach((step, index) => {
      if (!step.id) errors.push(`Step ${index}: ID is required`);
      if (!step.name) errors.push(`Step ${index}: Name is required`);
      if (!step.operator) errors.push(`Step ${index}: Operator is required`);
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

function createStandaloneExecutor() {
  // Create workflow engine instance
  const engine = new WorkflowEngine();

  // Register default operators
  const browserOperator = new BrowserOperator();
  const cookieOperator = new CookieOperator();
  const navigationOperator = new NavigationOperator();

  engine.registerOperator('browser', browserOperator);
  engine.registerOperator('cookie', cookieOperator);
  engine.registerOperator('navigation', navigationOperator);

  // Create config manager
  const configManager = new SimpleConfigManager();

  return { engine, configManager };
}

async function executeWorkflow(workflowPath, inputVariables = {}, options = {}) {
  const { engine, configManager } = createStandaloneExecutor();

  try {
    // Load workflow configuration
    const workflow = await configManager.loadWorkflow(workflowPath);

    if (options.verbose) {
      console.log(`🚀 Executing workflow: ${workflow.name}`);
      console.log(`📋 Steps: ${workflow.steps.length}`);
      console.log(`🔧 Variables: ${Object.keys(inputVariables).join(', ')}`);
    }

    // Validate workflow
    const validation = configManager.validateWorkflow(workflow);
    if (!validation.valid) {
      throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
    }

    // Register workflow
    await engine.registerWorkflow(workflow);

    // Set up event listeners if verbose
    if (options.verbose) {
      engine.on('workflowStarted', ({ workflow, context }) => {
        console.log(`🎬 Started: ${workflow.name} (${context.id})`);
      });

      engine.on('stepStarted', ({ step, context, attempt }) => {
        if (options.logLevel === 'debug') {
          console.log(`⚡ Step started: ${step.name} (attempt ${attempt})`);
        }
      });

      engine.on('stepCompleted', ({ step, result, context, attempts }) => {
        const status = result.success ? '✅' : '❌';
        const duration = result.duration ? ` (${result.duration}ms)` : '';
        console.log(`${status} ${step.name}${duration}`);

        if (options.logLevel === 'debug' && result.data?.message) {
          console.log(`   💬 ${result.data.message}`);
        }
      });

      engine.on('workflowCompleted', ({ workflow, context }) => {
        console.log(`🎉 Completed: ${workflow.name} (${context.getExecutionTime()}ms)`);
      });

      engine.on('workflowError', ({ workflow, context, error }) => {
        console.log(`💥 Error: ${error}`);
      });
    }

    // Execute workflow
    const context = await engine.executeWorkflow(workflow.id, inputVariables);

    // Prepare result
    const result = {
      success: context.state === 'completed',
      workflowId: workflow.id,
      contextId: context.id,
      executionTime: context.getExecutionTime(),
      steps: {
        total: context.getStepCount(),
        successful: context.getSuccessfulSteps(),
        failed: context.getFailedSteps()
      },
      variables: context.variables,
      startTime: context.startTime,
      endTime: Date.now()
    };

    if (context.error) {
      result.error = context.error;
    }

    // Output results based on format
    outputResults(result, options.outputFormat);

    return result;

  } catch (error) {
    const result = {
      success: false,
      workflowId: 'unknown',
      contextId: 'unknown',
      executionTime: 0,
      steps: { total: 0, successful: 0, failed: 0 },
      variables: inputVariables,
      error: error instanceof Error ? error.message : String(error),
      startTime: Date.now(),
      endTime: Date.now()
    };

    outputResults(result, options.outputFormat);
    return result;
  }
}

async function validateWorkflow(workflowPath) {
  const { configManager } = createStandaloneExecutor();

  try {
    const workflow = await configManager.loadWorkflow(workflowPath);
    const validation = configManager.validateWorkflow(workflow);

    return {
      valid: validation.valid,
      errors: validation.errors || [],
      warnings: validation.warnings || []
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: []
    };
  }
}

function outputResults(result, format) {
  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else if (format === 'minimal') {
    console.log(`${result.success ? '✅' : '❌'} ${result.workflowId} - ${result.executionTime}ms`);
  } else {
    // Text format (default)
    console.log('\n📊 Execution Results');
    console.log('==================');
    console.log(`Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`Workflow: ${result.workflowId}`);
    console.log(`Context: ${result.contextId}`);
    console.log(`Duration: ${result.executionTime}ms`);
    console.log(`Steps: ${result.steps.successful}/${result.steps.total} successful`);

    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
  }
}

async function main() {
  const options = parseArgs();

  try {
    // Show help if no workflow provided and not listing operators
    if (!options.workflow && !options.listOperators) {
      showHelp();
      process.exit(1);
    }

    // List available operators
    if (options.listOperators) {
      console.log('🔧 Available Operators:');
      console.log('====================');
      console.log('  - browser: Browser management (start, stop, configure)');
      console.log('  - cookie: Cookie management (save, load, clear)');
      console.log('  - navigation: Page navigation (navigate, back, forward, refresh)');
      process.exit(0);
    }

    // Load variables from files if needed
    loadVariablesFromFile(options.variables);

    console.log('🎯 WebAuto Workflow Engine (Standalone)');
    console.log('======================================');
    console.log(`📋 Workflow: ${options.workflow}`);
    console.log(`🔧 Variables: ${Object.keys(options.variables).join(', ') || 'none'}`);
    console.log(`📊 Output: ${options.outputFormat} | 📝 Log Level: ${options.logLevel}`);
    console.log('');

    // Validate workflow first
    console.log('🔍 Validating workflow...');
    const validation = await validateWorkflow(options.workflow);

    if (!validation.valid) {
      console.error('❌ Workflow validation failed:');
      validation.errors.forEach(error => {
        console.error(`   - ${error}`);
      });

      if (validation.warnings.length > 0) {
        console.warn('⚠️  Warnings:');
        validation.warnings.forEach(warning => {
          console.warn(`   - ${warning}`);
        });
      }

      process.exit(1);
    }

    console.log('✅ Workflow validation passed');

    if (validation.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      validation.warnings.forEach(warning => {
        console.log(`   - ${warning}`);
      });
    }

    // If only validation requested, exit
    if (options.validate) {
      console.log('🎉 Validation complete - workflow is ready for execution');
      process.exit(0);
    }

    // Execute the workflow
    console.log('🚀 Executing workflow...');
    const result = await executeWorkflow(
      options.workflow,
      options.variables,
      {
        verbose: options.verbose,
        dryRun: options.dryRun,
        outputFormat: options.outputFormat,
        logLevel: options.logLevel
      }
    );

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('💥 Execution failed:', error.message);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason instanceof Error ? reason.message : String(reason));
  process.exit(1);
});

// Main execution
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, parseArgs, showHelp, executeWorkflow, validateWorkflow };