/**
 * WebAuto Workflow Engine - Demo Implementation
 * @package @webauto/workflow-engine
 */

const path = require('path');

// Import our workflow engine components
const { WorkflowEngine } = require('../src/workflow/WorkflowEngine');
const { ConfigManager } = require('../src/workflow/ConfigManager');
const { BrowserOperator } = require('../src/operators/simple/BrowserOperator');
const { CookieOperator } = require('../src/operators/simple/CookieOperator');
const { NavigationOperator } = require('../src/operators/simple/NavigationOperator');

class WorkflowDemo {
  constructor() {
    this.engine = new WorkflowEngine();
    this.configManager = new ConfigManager();
    this.setupOperators();
  }

  setupOperators() {
    // Register all operators
    this.engine.registerOperator('browser', new BrowserOperator());
    this.engine.registerOperator('cookie', new CookieOperator());
    this.engine.registerOperator('navigation', new NavigationOperator());

    console.log('✅ Operators registered:');
    console.log('   - Browser Operator: browser management');
    console.log('   - Cookie Operator: cookie management');
    console.log('   - Navigation Operator: page navigation');
  }

  async runWeiboWorkflow() {
    console.log('\n🚀 Starting Weibo Workflow Demo');
    console.log('=====================================');

    try {
      // Load workflow configuration
      const workflowPath = path.join(__dirname, 'weibo-workflow.json');
      console.log(`📋 Loading workflow from: ${workflowPath}`);

      const workflow = await this.configManager.loadWorkflow(workflowPath);
      console.log(`📝 Workflow loaded: ${workflow.name}`);
      console.log(`🔢 Steps: ${workflow.steps.length}`);
      console.log(`📊 Variables: ${Object.keys(workflow.variables).join(', ')}`);

      // Register workflow
      await this.engine.registerWorkflow(workflow);
      console.log('✅ Workflow registered successfully');

      // Set up event listeners
      this.setupEventListeners();

      // Execute workflow
      console.log('\n🔄 Executing workflow...');
      const context = await this.engine.executeWorkflow(workflow.id, {
        startTime: Date.now(),
        demoMode: true
      });

      // Display results
      this.displayResults(context);

      return context;

    } catch (error) {
      console.error('\n❌ Workflow execution failed:', error.message);
      throw error;
    }
  }

  setupEventListeners() {
    this.engine.on('workflowStarted', ({ workflow, context }) => {
      console.log(`🎬 Workflow started: ${workflow.name} (ID: ${context.id})`);
    });

    this.engine.on('stepStarted', ({ step, context, attempt }) => {
      console.log(`⚡ Step started: ${step.name} (Attempt ${attempt})`);
    });

    this.engine.on('stepCompleted', ({ step, result, context, attempts }) => {
      const status = result.success ? '✅' : '❌';
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      console.log(`${status} Step completed: ${step.name}${duration}`);

      if (result.data) {
        if (result.data.message) {
          console.log(`   💬 ${result.data.message}`);
        }
        if (result.data.screenshotPath) {
          console.log(`   📸 Screenshot: ${result.data.screenshotPath}`);
        }
      }
    });

    this.engine.on('stepError', ({ step, error, context, attempts }) => {
      console.log(`❌ Step error: ${step.name} - ${error}`);
    });

    this.engine.on('workflowCompleted', ({ workflow, context }) => {
      console.log(`🎉 Workflow completed: ${workflow.name}`);
      console.log(`⏱️  Execution time: ${context.getExecutionTime()}ms`);
      console.log(`📈 Success rate: ${context.getSuccessfulSteps()}/${context.getStepCount()} steps`);
    });

    this.engine.on('workflowError', ({ workflow, context, error }) => {
      console.log(`💥 Workflow error: ${error}`);
    });
  }

  displayResults(context) {
    console.log('\n📊 Execution Results');
    console.log('==================');
    console.log(`🏷️  Workflow ID: ${context.workflowId}`);
    console.log(`🆔 Context ID: ${context.id}`);
    console.log(`📅 Start Time: ${new Date(context.startTime).toLocaleString()}`);
    console.log(`⏱️  Duration: ${context.getExecutionTime()}ms`);
    console.log(`📈 Progress: ${context.getProgress().toFixed(1)}%`);
    console.log(`✅ Successful Steps: ${context.getSuccessfulSteps()}`);
    console.log(`❌ Failed Steps: ${context.getFailedSteps()}`);
    console.log(`📊 Total Steps: ${context.getStepCount()}`);

    // Display step details
    console.log('\n📋 Step Execution Details');
    console.log('========================');
    context.steps.forEach((step, index) => {
      const status = step.result.success ? '✅' : '❌';
      const duration = step.result.duration ? `${step.result.duration}ms` : 'N/A';
      console.log(`${index + 1}. ${status} ${step.stepName} (${duration})`);

      if (step.result.error) {
        console.log(`   Error: ${step.result.error}`);
      }

      if (step.result.data && step.result.data.message) {
        console.log(`   Result: ${step.result.data.message}`);
      }
    });

    // Display variables
    console.log('\n🔧 Final Variables');
    console.log('==================');
    Object.entries(context.variables).forEach(([key, value]) => {
      console.log(`${key}: ${JSON.stringify(value)}`);
    });

    // Display performance metrics
    const metrics = this.engine.getPerformanceMetrics();
    console.log('\n📈 Performance Metrics');
    console.log('=====================');
    console.log(`Total Duration: ${metrics.totalDuration}ms`);
    console.log(`Average Step Duration: ${metrics.averageStepDuration.toFixed(2)}ms`);
    console.log(`Success Rate: ${metrics.successRate.toFixed(1)}%`);
    console.log(`Retry Count: ${metrics.retryCount}`);
    console.log(`Error Count: ${metrics.errorCount}`);
  }

  async createSampleCookies() {
    console.log('\n🍪 Creating sample cookies file...');

    const sampleCookies = {
      cookies: [
        {
          name: "SUB",
          value: "_2AkMVY...",
          domain: ".weibo.com",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400 * 30,
          secure: true,
          httpOnly: true,
          sameSite: "lax"
        },
        {
          name: "SUBP",
          value: "_2AkMVY...",
          domain: ".weibo.com",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400 * 30,
          secure: true,
          httpOnly: true,
          sameSite: "lax"
        }
      ],
      savedAt: Date.now(),
      version: "1.0"
    };

    const fs = require('fs');
    const path = require('path');
    const cookiePath = path.join(__dirname, 'cookies.json');

    try {
      fs.writeFileSync(cookiePath, JSON.stringify(sampleCookies, null, 2));
      console.log(`✅ Sample cookies created: ${cookiePath}`);
    } catch (error) {
      console.log(`⚠️  Could not create sample cookies: ${error.message}`);
    }
  }
}

// Main execution function
async function runDemo() {
  console.log('🎯 WebAuto Workflow Engine Demo');
  console.log('================================');
  console.log('This demo demonstrates a complete workflow that:');
  console.log('1. Starts a browser instance');
  console.log('2. Loads cookies for session persistence');
  console.log('3. Navigates to Weibo homepage');
  console.log('4. Waits for page to load');
  console.log('5. Captures screenshots');
  console.log('6. Saves session cookies');
  console.log('');

  const demo = new WorkflowDemo();

  try {
    // Create sample cookies file
    await demo.createSampleCookies();

    // Run the workflow
    const context = await demo.runWeiboWorkflow();

    console.log('\n🎊 Demo completed successfully!');
    console.log('============================');

    if (context.state === 'completed') {
      console.log('✅ All steps executed successfully');
      console.log('📝 Check the logs above for detailed execution information');
    } else {
      console.log('⚠️  Workflow completed with some issues');
    }

  } catch (error) {
    console.error('\n💥 Demo failed:', error.message);
    process.exit(1);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { WorkflowDemo, runDemo };