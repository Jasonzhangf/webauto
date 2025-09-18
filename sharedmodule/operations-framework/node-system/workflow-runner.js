#!/usr/bin/env node

/**
 * ComfyUI-Inspired Workflow Runner
 * Executes node-based workflows with visual progress tracking
 */

const WorkflowEngine = require('./workflow-engine');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class WorkflowRunner {
    constructor(options = {}) {
        this.options = {
            logLevel: options.logLevel || 'info',
            enableProgress: options.enableProgress !== false,
            outputDir: options.outputDir || './workflow-outputs',
            ...options
        };
        this.engine = new WorkflowEngine();
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Workflow events
        this.engine.on('workflowStarted', (data) => {
            this.log('info', `🚀 Workflow started at ${new Date(data.startTime).toLocaleString()}`);
        });

        this.engine.on('workflowCompleted', (data) => {
            this.log('info', `✅ Workflow completed in ${data.executionTime}ms`);
            this.log('info', `📊 Stats: ${data.stats.completedNodes}/${data.stats.totalNodes} nodes completed`);
        });

        this.engine.on('workflowFailed', (data) => {
            this.log('error', `❌ Workflow failed: ${data.error}`);
            this.log('error', `⏱️  Execution time: ${data.executionTime}ms`);
        });

        // Node events
        this.engine.on('nodeStarted', (data) => {
            this.log('info', `🔧 Node started: ${data.nodeId}`);
        });

        this.engine.on('nodeCompleted', (data) => {
            this.log('info', `✅ Node completed: ${data.nodeId} (${data.executionTime}ms)`);
        });

        this.engine.on('nodeFailed', (data) => {
            this.log('error', `❌ Node failed: ${data.nodeId} - ${data.error}`);
        });

        // Progress events
        this.engine.on('executionProgress', (data) => {
            if (this.options.enableProgress) {
                this.log('info', `📈 Progress: ${data.completedNodes}/${data.totalNodes} completed`);
            }
        });
    }

    log(level, message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

        if (this.options.logLevel === 'debug' ||
            (this.options.logLevel === 'info' && level !== 'debug') ||
            (this.options.logLevel === 'warn' && ['error', 'warn'].includes(level)) ||
            (this.options.logLevel === 'error' && level === 'error')) {
            console.log(logMessage);
        }
    }

    async loadWorkflow(workflowPath) {
        try {
            this.log('info', `📁 Loading workflow from: ${workflowPath}`);

            const content = await fs.readFile(workflowPath, 'utf-8');
            const workflowConfig = JSON.parse(content);

            // Process variables (replace ${TIMESTAMP} etc.)
            this.processVariables(workflowConfig);

            // Load workflow into engine
            await this.engine.loadWorkflow(workflowConfig);

            this.log('info', `✅ Workflow loaded successfully`);
            this.log('info', `📋 Nodes: ${workflowConfig.nodes.length}, Connections: ${workflowConfig.connections.length}`);

            return workflowConfig;

        } catch (error) {
            this.log('error', `❌ Failed to load workflow: ${error.message}`);
            throw error;
        }
    }

    processVariables(workflowConfig) {
        if (!workflowConfig.variables) {
            workflowConfig.variables = {};
        }

        // Add timestamp variable
        workflowConfig.variables.TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
        workflowConfig.variables.DATE = new Date().toISOString().split('T')[0];
        workflowConfig.variables.TIME = new Date().toISOString().split('T')[1].split('.')[0];

        // Add system variables
        workflowConfig.variables.HOME = os.homedir();
        workflowConfig.variables.TMP = os.tmpdir();
        workflowConfig.variables.CWD = process.cwd();

        // Process all variable values
        for (const [key, value] of Object.entries(workflowConfig.variables)) {
            if (typeof value === 'string' && value.includes('${')) {
                workflowConfig.variables[key] = this.resolveVariables(value, workflowConfig.variables);
            }
        }
    }

    resolveVariables(expression, variables) {
        return expression.replace(/\$\{([^}]+)\}/g, (match, varKey) => {
            if (variables[varKey] !== undefined) {
                return String(variables[varKey]);
            }
            return match; // Return original if variable not found
        });
    }

    async execute() {
        try {
            this.log('info', '🎯 Starting workflow execution');

            const result = await this.engine.execute();

            // Save execution results
            await this.saveExecutionResults(result);

            return result;

        } catch (error) {
            this.log('error', `❌ Execution failed: ${error.message}`);
            throw error;
        }
    }

    async saveExecutionResults(result) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const resultFile = path.join(this.options.outputDir, `execution-result-${timestamp}.json`);

            // Ensure output directory exists
            await fs.mkdir(this.options.outputDir, { recursive: true });

            // Save detailed results
            const detailedResult = {
                ...result,
                workflowStatus: this.engine.getWorkflowStatus(),
                timestamp: new Date().toISOString(),
                options: this.options
            };

            await fs.writeFile(resultFile, JSON.stringify(detailedResult, null, 2));

            this.log('info', `📄 Execution results saved to: ${resultFile}`);

            return resultFile;

        } catch (error) {
            this.log('warn', `⚠️  Failed to save execution results: ${error.message}`);
        }
    }

    async validateWorkflow() {
        try {
            const validation = this.engine.validateWorkflow();

            if (validation.valid) {
                this.log('info', '✅ Workflow validation passed');
            } else {
                this.log('error', '❌ Workflow validation failed:');
                validation.errors.forEach(error => {
                    this.log('error', `   - ${error}`);
                });
            }

            return validation;

        } catch (error) {
            this.log('error', `❌ Validation failed: ${error.message}`);
            throw error;
        }
    }

    exportWorkflow(outputPath) {
        try {
            const exported = this.engine.exportWorkflow();

            if (outputPath) {
                const fs = require('fs');
                fs.writeFileSync(outputPath, JSON.stringify(exported, null, 2));
                this.log('info', `📄 Workflow exported to: ${outputPath}`);
            }

            return exported;

        } catch (error) {
            this.log('error', `❌ Export failed: ${error.message}`);
            throw error;
        }
    }

    async getWorkflowStatus() {
        return this.engine.getWorkflowStatus();
    }

    async visualizeWorkflow() {
        try {
            const status = await this.getWorkflowStatus();

            console.log('\n📊 Workflow Visualization');
            console.log('========================');

            // Display nodes
            console.log('\n🔧 Nodes:');
            status.nodes.forEach(node => {
                const statusIcon = {
                    'idle': '⏸️',
                    'running': '🔄',
                    'completed': '✅',
                    'error': '❌'
                }[node.state] || '⏸️';

                console.log(`  ${statusIcon} ${node.title} (${node.type}) - ${node.state}`);
                if (node.lastExecutionResult) {
                    const time = node.lastExecutionResult.executionTime || 0;
                    console.log(`     ⏱️  ${time}ms`);
                }
            });

            // Display connections
            console.log('\n🔗 Connections:');
            status.connections.forEach((conn, index) => {
                const icon = conn.valid ? '✅' : '❌';
                console.log(`  ${index + 1}. ${conn.from} → ${conn.to} ${icon}`);
                if (conn.error) {
                    console.log(`     Error: ${conn.error}`);
                }
            });

            // Display statistics
            console.log('\n📈 Statistics:');
            console.log(`  Total Nodes: ${status.stats.totalNodes}`);
            console.log(`  Completed: ${status.stats.completedNodes}`);
            console.log(`  Failed: ${status.stats.failedNodes}`);
            console.log(`  Execution Time: ${status.stats.executionTime}ms`);

        } catch (error) {
            this.log('error', `❌ Visualization failed: ${error.message}`);
        }
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    if (options.help || !options.workflow) {
        showHelp();
        process.exit(0);
    }

    try {
        const runner = new WorkflowRunner(options);

        if (options.validate) {
            await runner.loadWorkflow(options.workflow);
            const validation = await runner.validateWorkflow();
            process.exit(validation.valid ? 0 : 1);
        }

        if (options.export) {
            await runner.loadWorkflow(options.workflow);
            runner.exportWorkflow(options.export);
            process.exit(0);
        }

        if (options.visualize) {
            await runner.loadWorkflow(options.workflow);
            await runner.visualizeWorkflow();
            process.exit(0);
        }

        // Execute workflow
        await runner.loadWorkflow(options.workflow);
        const result = await runner.execute();

        process.exit(result.success ? 0 : 1);

    } catch (error) {
        console.error('💥 Fatal error:', error.message);
        process.exit(1);
    }
}

function parseArgs(args) {
    const options = {
        workflow: null,
        validate: false,
        export: null,
        visualize: false,
        logLevel: 'info',
        enableProgress: true,
        outputDir: './workflow-outputs'
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '--workflow':
            case '-w':
                options.workflow = args[i + 1];
                i++;
                break;
            case '--validate':
                options.validate = true;
                break;
            case '--export':
                options.export = args[i + 1];
                i++;
                break;
            case '--visualize':
                options.visualize = true;
                break;
            case '--log-level':
                options.logLevel = args[i + 1];
                i++;
                break;
            case '--output-dir':
                options.outputDir = args[i + 1];
                i++;
                break;
            case '--no-progress':
                options.enableProgress = false;
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
        }
    }

    return options;
}

function showHelp() {
    console.log(`
🎯 ComfyUI Workflow Runner
==========================

USAGE:
  node workflow-runner.js --workflow <path> [options]

OPTIONS:
  -w, --workflow <path>       Path to workflow JSON file (required)
  --validate                  Only validate workflow, don't execute
  --export <path>             Export workflow to JSON file
  --visualize                 Show workflow visualization
  --log-level <level>         Log level: debug, info, warn, error (default: info)
  --output-dir <path>         Output directory for results (default: ./workflow-outputs)
  --no-progress               Disable progress display
  -h, --help                  Show this help message

EXAMPLES:
  # Execute Weibo post extraction workflow
  node workflow-runner.js --workflow ./weibo-post-extraction-workflow.json

  # Validate workflow configuration
  node workflow-runner.js --workflow ./weibo-post-extraction-workflow.json --validate

  # Visualize workflow structure
  node workflow-runner.js --workflow ./weibo-post-extraction-workflow.json --visualize

  # Export workflow configuration
  node workflow-runner.js --workflow ./weibo-post-extraction-workflow.json --export exported-workflow.json

NOTE: This runner executes ComfyUI-inspired node-based workflows for WebAuto automation.
`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = WorkflowRunner;