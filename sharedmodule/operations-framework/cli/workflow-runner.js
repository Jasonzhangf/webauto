#!/usr/bin/env node

/**
 * WebAuto Workflow Engine - Universal CLI Runner
 * @package @webauto/workflow-engine
 *
 * This is the universal CLI runner that can execute any workflow configuration
 */

const path = require('path');
const fs = require('fs');

// Import our workflow executor
const {
  workflowExecutor,
  executeWorkflow,
  executeWorkflowFromFile,
  validateWorkflow
} = require('../src/workflow/WorkflowExecutor');

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
🎯 WebAuto Workflow Engine - Universal CLI Runner
================================================

USAGE:
  node workflow-runner.js --workflow <path> [options]

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
  node workflow-runner.js --workflow ./demo/weibo-workflow.json

  # Execute with custom variables
  node workflow-runner.js --workflow ./demo/weibo-workflow.json --variable targetUrl=https://example.com

  # Execute with verbose output
  node workflow-runner.js --workflow ./demo/weibo-workflow.json --verbose

  # Validate workflow only
  node workflow-runner.js --workflow ./demo/weibo-workflow.json --validate

  # List available operators
  node workflow-runner.js --list-operators

  # Execute multiple workflows
  node workflow-runner.js --workflow ./workflow1.json --workflow ./workflow2.json
  `);
}

function loadVariablesFromFile(variables) {
  // Check if any variable values are file paths (starting with @)
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === 'string' && value.startsWith('@')) {
      const filePath = value.slice(1);
      try {
        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
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
      const operators = workflowExecutor.getAvailableOperators();
      operators.forEach(op => {
        console.log(`  - ${op}`);
      });
      process.exit(0);
    }

    // Load variables from files if needed
    loadVariablesFromFile(options.variables);

    console.log('🎯 WebAuto Workflow Engine');
    console.log('========================');
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
    const result = await executeWorkflowFromFile(
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

module.exports = { main, parseArgs, showHelp };