#!/usr/bin/env node

/**
 * WebAuto Workflow Engine - Real Browser CLI Runner
 * This uses real Playwright browser instances instead of mock operators
 */

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// Import real browser operators
const {
  RealBrowserOperator,
  RealCookieOperator,
  RealNavigationOperator
} = require('./real-browser-operator.js');

const ContainerExtractorOperator = require('./container-extractor-operator.js');

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
🎯 WebAuto Workflow Engine - Real Browser CLI Runner
======================================================

USAGE:
  node workflow-runner-real.js --workflow <path> [options]

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
  # Execute Weibo workflow with real browser
  node workflow-runner-real.js --workflow ./weibo-workflow.json

  # Execute with real browser (non-headless) and custom variables
  node workflow-runner-real.js --workflow ./weibo-workflow.json --variable browserHeadless=false

  # Execute with real browser and custom target URL
  node workflow-runner-real.js --workflow ./weibo-workflow.json --variable targetUrl=https://weibo.com

NOTE: This version uses REAL Playwright browser instances and will actually
launch a visible browser window when browserHeadless=false.
  `);
}

function loadVariablesFromFile(variables) {
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

// Simple config manager
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

// Simple workflow executor for real browsers
class RealWorkflowExecutor {
  constructor() {
    this.browserOperator = new RealBrowserOperator();
    this.cookieOperator = new RealCookieOperator();
    this.navigationOperator = new RealNavigationOperator();
    this.containerExtractor = new ContainerExtractorOperator();

    // Connect operators
    this.cookieOperator.setBrowserOperator(this.browserOperator);
    this.navigationOperator.setBrowserOperator(this.browserOperator);
    this.containerExtractor.setBrowserOperator(this.browserOperator);
  }

  async executeWorkflow(workflow, inputVariables = {}) {
    const startTime = Date.now();
    const results = [];

    try {
      console.log(`🚀 Executing workflow: ${workflow.name}`);
      console.log(`📋 Steps: ${workflow.steps.length}`);

      // Execute steps in sequence
      for (const step of workflow.steps) {
        console.log(`⚡ Step started: ${step.name}`);

        const result = await this.executeStep(step, inputVariables);
        results.push(result);

        const status = result.success ? '✅' : '❌';
        const duration = result.duration ? ` (${result.duration}ms)` : '';
        console.log(`${status} ${step.name}${duration}`);

        if (result.success && result.data?.message) {
          console.log(`   💬 ${result.data.message}`);
        }

        if (!result.success) {
          console.log(`   💥 Error: ${result.error}`);
          if (!step.params?.continueOnError) {
            break;
          }
        }
      }

      const finalResult = {
        success: results.every(r => r.success) || results.some(r => r.success),
        workflowId: workflow.id,
        executionTime: Date.now() - startTime,
        steps: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        },
        variables: inputVariables,
        results: results,
        startTime,
        endTime: Date.now()
      };

      return finalResult;

    } catch (error) {
      return {
        success: false,
        workflowId: workflow.id,
        executionTime: Date.now() - startTime,
        steps: { total: 0, successful: 0, failed: 0 },
        variables: inputVariables,
        error: error.message,
        startTime,
        endTime: Date.now()
      };
    }
  }

  async executeStep(step, variables) {
    const startTime = Date.now();

    try {
      // Resolve variables in step parameters
      const resolvedParams = this.resolveVariables(step.params || {}, variables);

      let operator;
      switch (step.operator) {
        case 'browser':
          operator = this.browserOperator;
          break;
        case 'cookie':
          operator = this.cookieOperator;
          break;
        case 'navigation':
          operator = this.navigationOperator;
          break;
        default:
          throw new Error(`Unknown operator: ${step.operator}`);
      }

      let result;
      try {
        result = await operator.execute(resolvedParams);
      } catch (error) {
        result = {
          success: false,
          data: null,
          error: error.message,
          duration: 0,
          timestamp: Date.now()
        };
      }

      // Store results in variables for subsequent steps
      if (result.success && result.data) {
        if (step.id === 'navigate-to-page') {
          variables.navigationResult = result.data;
        } else if (step.id === 'get-page-info') {
          variables.pageInfo = result.data;
        }
      }

      return {
        ...result,
        stepId: step.id,
        stepName: step.name
      };

    } catch (error) {
      return {
        success: false,
        stepId: step.id,
        stepName: step.name,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  resolveVariables(params, variables) {
    const resolved = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.includes('${')) {
        resolved[key] = value.replace(/\$\{([^}]+)\}/g, (match, varKey) => {
          return variables[varKey] !== undefined ? String(variables[varKey]) : match;
        });
      } else {
        resolved[key] = value;
      }
    }

    // Handle home directory expansion for paths
    if (resolved.path && typeof resolved.path === 'string' && resolved.path.startsWith('~')) {
      const os = require('os');
      const path = require('path');
      resolved.path = resolved.path.replace('~', os.homedir());
    }

    return resolved;
  }

  async cleanup() {
    try {
      if (this.browserOperator && this.browserOperator.isInitialized()) {
        console.log('🧹 Cleaning up browser resources...');
        await this.browserOperator.stopBrowser();
      }
    } catch (error) {
      console.warn(`⚠️ Cleanup warning: ${error.message}`);
    }
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
    console.log(`Duration: ${result.executionTime}ms`);
    console.log(`Steps: ${result.steps.successful}/${result.steps.total} successful`);

    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
  }
}

async function main() {
  const options = parseArgs();

  // Handle Ctrl+C gracefully
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, cleaning up...');
    process.exit(0);
  });

  try {
    if (!options.workflow && !options.listOperators) {
      showHelp();
      process.exit(1);
    }

    if (options.listOperators) {
      console.log('🔧 Available Operators (Real Browser):');
      console.log('====================================');
      console.log('  - browser: Real browser management (start, stop, restart)');
      console.log('  - cookie: Real cookie management (save, load, clear)');
      console.log('  - navigation: Real page navigation (navigate, wait, screenshot)');
      process.exit(0);
    }

    loadVariablesFromFile(options.variables);

    console.log('🎯 WebAuto Workflow Engine (Real Browser)');
    console.log('=====================================');
    console.log(`📋 Workflow: ${options.workflow}`);
    console.log(`🔧 Variables: ${Object.keys(options.variables).join(', ') || 'none'}`);
    console.log(`📊 Output: ${options.outputFormat} | 📝 Log Level: ${options.logLevel}`);
    console.log('');

    // Validate workflow first
    console.log('🔍 Validating workflow...');
    const configManager = new SimpleConfigManager();
    const workflow = await configManager.loadWorkflow(options.workflow);
    const validation = configManager.validateWorkflow(workflow);

    if (!validation.valid) {
      console.error('❌ Workflow validation failed:');
      validation.errors.forEach(error => {
        console.error(`   - ${error}`);
      });
      process.exit(1);
    }

    console.log('✅ Workflow validation passed');

    if (options.validate) {
      console.log('🎉 Validation complete - workflow is ready for execution');
      process.exit(0);
    }

    // Merge workflow variables with input variables
    const allVariables = {
      ...workflow.variables,
      ...options.variables
    };

    console.log('🚀 Executing workflow...');
    const executor = new RealWorkflowExecutor();

    try {
      const result = await executor.executeWorkflow(workflow, allVariables);

      outputResults(result, options.outputFormat);

      // Cleanup
      await executor.cleanup();

      process.exit(result.success ? 0 : 1);

    } catch (error) {
      console.error('💥 Execution failed:', error.message);
      await executor.cleanup();
      process.exit(1);
    }

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

module.exports = { main, parseArgs, showHelp };