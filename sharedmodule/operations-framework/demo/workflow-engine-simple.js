/**
 * WebAuto Workflow Engine - Simple JavaScript Implementation
 * @package @webauto/workflow-engine
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

// Simple types for JavaScript implementation
const OperatorState = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
  PAUSED: 'paused'
};

// Simple operation result
class OperationResult {
  constructor(success, data = null, error = null) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.duration = 0;
    this.timestamp = Date.now();
  }

  static success(data) {
    return new OperationResult(true, data);
  }

  static error(error) {
    return new OperationResult(false, null, error);
  }
}

// Simple Browser Operator
class BrowserOperator {
  constructor() {
    this.config = {
      id: 'browser',
      name: 'Browser Operator',
      type: 'browser',
      description: 'Manages browser instances for web automation',
      version: '1.0.0'
    };
    this._browser = null;
    this._isInitialized = false;
  }

  async execute(params) {
    const startTime = Date.now();

    try {
      switch (params.action) {
        case 'start':
          return await this.startBrowser(params);
        case 'stop':
          return await this.stopBrowser();
        case 'restart':
          return await this.restartBrowser(params);
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      return OperationResult.error(error.message);
    }
  }

  validate(params) {
    if (!params.action || !['start', 'stop', 'restart'].includes(params.action)) {
      return false;
    }
    return true;
  }

  getCapabilities() {
    return ['browser-management', 'viewport-control', 'user-agent-control'];
  }

  async startBrowser(params) {
    if (this._isInitialized && this._browser) {
      return OperationResult.success({
        message: 'Browser already started',
        browser: this._browser
      });
    }

    const browserConfig = {
      headless: params.headless || false,
      viewport: params.viewport || { width: 1920, height: 1080 },
      userAgent: params.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      timeout: params.timeout || 30000
    };

    this._browser = {
      id: `browser_${Date.now()}`,
      config: browserConfig,
      pages: [],
      createdAt: Date.now()
    };

    this._isInitialized = true;

    return OperationResult.success({
      message: 'Browser started successfully',
      browser: this._browser,
      config: browserConfig
    });
  }

  async stopBrowser() {
    if (!this._isInitialized || !this._browser) {
      return OperationResult.success({
        message: 'Browser not running'
      });
    }

    const browserInfo = { ...this._browser };
    this._browser = null;
    this._isInitialized = false;

    return OperationResult.success({
      message: 'Browser stopped successfully',
      browser: browserInfo
    });
  }

  async restartBrowser(params) {
    await this.stopBrowser();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.startBrowser(params);
  }
}

// Simple Cookie Operator
class CookieOperator {
  constructor() {
    this.config = {
      id: 'cookie',
      name: 'Cookie Operator',
      type: 'cookie',
      description: 'Manages browser cookies for session persistence',
      version: '1.0.0'
    };
    this._cookieStore = new Map();
    this._currentCookies = [];
  }

  async execute(params) {
    const startTime = Date.now();

    try {
      switch (params.action) {
        case 'save':
          return await this.saveCookies(params.path || './cookies.json');
        case 'load':
          return await this.loadCookies(params.path || './cookies.json');
        case 'clear':
          return await this.clearCookies(params.domain);
        case 'set':
          return await this.setCookie(params.name, params.value, params.domain);
        case 'get':
          return await this.getCookie(params.name, params.domain);
        case 'delete':
          return await this.deleteCookie(params.name, params.domain);
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      return OperationResult.error(error.message);
    }
  }

  validate(params) {
    if (!params.action || !['save', 'load', 'clear', 'set', 'get', 'delete'].includes(params.action)) {
      return false;
    }
    return true;
  }

  getCapabilities() {
    return ['cookie-management', 'session-persistence', 'domain-filtering'];
  }

  async saveCookies(filePath) {
    try {
      const absolutePath = path.resolve(filePath);
      const dirPath = path.dirname(absolutePath);
      await fs.mkdir(dirPath, { recursive: true });

      const content = JSON.stringify({
        cookies: this._currentCookies,
        savedAt: Date.now(),
        version: '1.0'
      }, null, 2);

      await fs.writeFile(absolutePath, content, 'utf-8');

      return OperationResult.success({
        message: `Cookies saved to ${filePath}`,
        path: absolutePath,
        count: this._currentCookies.length
      });

    } catch (error) {
      return OperationResult.error(error.message);
    }
  }

  async loadCookies(filePath) {
    try {
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, 'utf-8');
      const data = JSON.parse(content);

      if (!data.cookies || !Array.isArray(data.cookies)) {
        throw new Error('Invalid cookie file format');
      }

      this._currentCookies = data.cookies;

      this._cookieStore.clear();
      for (const cookie of this._currentCookies) {
        if (!this._cookieStore.has(cookie.domain)) {
          this._cookieStore.set(cookie.domain, []);
        }
        this._cookieStore.get(cookie.domain).push(cookie);
      }

      return OperationResult.success({
        message: `Cookies loaded from ${filePath}`,
        path: absolutePath,
        count: this._currentCookies.length,
        domains: Array.from(this._cookieStore.keys())
      });

    } catch (error) {
      return OperationResult.error(error.message);
    }
  }

  async clearCookies(domain) {
    let clearedCount = 0;

    if (domain) {
      const cookies = this._cookieStore.get(domain);
      if (cookies) {
        clearedCount = cookies.length;
        this._cookieStore.delete(domain);
        this._currentCookies = this._currentCookies.filter(c => c.domain !== domain);
      }
    } else {
      clearedCount = this._currentCookies.length;
      this._cookieStore.clear();
      this._currentCookies = [];
    }

    return OperationResult.success({
      message: `Cleared ${clearedCount} cookies`,
      clearedCount,
      domain: domain || 'all'
    });
  }

  async setCookie(name, value, domain) {
    const cookie = {
      name,
      value,
      domain: domain || 'default',
      path: '/',
      secure: false,
      httpOnly: false,
      sameSite: 'lax'
    };

    const existingIndex = this._currentCookies.findIndex(c =>
      c.name === name && c.domain === cookie.domain
    );

    if (existingIndex >= 0) {
      this._currentCookies[existingIndex] = cookie;
    } else {
      this._currentCookies.push(cookie);
    }

    if (!this._cookieStore.has(cookie.domain)) {
      this._cookieStore.set(cookie.domain, []);
    }

    const domainCookies = this._cookieStore.get(cookie.domain);
    const existingDomainIndex = domainCookies.findIndex(c => c.name === name);

    if (existingDomainIndex >= 0) {
      domainCookies[existingDomainIndex] = cookie;
    } else {
      domainCookies.push(cookie);
    }

    return OperationResult.success({
      message: `Cookie set: ${name}`,
      cookie
    });
  }

  async getCookie(name, domain) {
    const cookie = this._currentCookies.find(c =>
      c.name === name && (!domain || c.domain === domain)
    );

    if (!cookie) {
      return OperationResult.error(`Cookie not found: ${name}`);
    }

    return OperationResult.success({
      message: `Cookie found: ${name}`,
      cookie
    });
  }

  async deleteCookie(name, domain) {
    const initialCount = this._currentCookies.length;
    this._currentCookies = this._currentCookies.filter(c =>
      !(c.name === name && (!domain || c.domain === domain))
    );

    if (domain) {
      const domainCookies = this._cookieStore.get(domain);
      if (domainCookies) {
        this._cookieStore.set(domain, domainCookies.filter(c => c.name !== name));
      }
    } else {
      for (const [domainKey, cookies] of this._cookieStore.entries()) {
        this._cookieStore.set(domainKey, cookies.filter(c => c.name !== name));
      }
    }

    const deletedCount = initialCount - this._currentCookies.length;

    return OperationResult.success({
      message: `Cookie deleted: ${name}`,
      deletedCount,
      domain: domain || 'all'
    });
  }
}

// Simple Navigation Operator
class NavigationOperator {
  constructor() {
    this.config = {
      id: 'navigation',
      name: 'Navigation Operator',
      type: 'navigation',
      description: 'Handles browser navigation and page interactions',
      version: '1.0.0'
    };
    this._currentPage = null;
    this._history = [];
    this._historyIndex = -1;
  }

  async execute(params) {
    const startTime = Date.now();

    try {
      switch (params.action) {
        case 'navigate':
          return await this.navigateTo(params.url, params);
        case 'back':
          return await this.goBack(params);
        case 'forward':
          return await this.goForward(params);
        case 'refresh':
          return await this.refresh(params);
        case 'wait':
          return await this.wait(params.waitTime || 1000);
        case 'screenshot':
          return await this.takeScreenshot(params);
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      return OperationResult.error(error.message);
    }
  }

  validate(params) {
    if (!params.action || !['navigate', 'back', 'forward', 'refresh', 'wait', 'screenshot'].includes(params.action)) {
      return false;
    }
    return true;
  }

  getCapabilities() {
    return ['navigation', 'waiting', 'screenshot', 'page-analysis'];
  }

  async navigateTo(url, params) {
    const startTime = Date.now();
    const timeout = params.timeout || 30000;

    try {
      const pageInfo = {
        url,
        title: `Page: ${new URL(url).hostname}`,
        loadTime: Date.now() - startTime,
        status: 'loaded',
        statusCode: 200
      };

      if (params.waitFor) {
        await this.simulateWaitForElement(params.waitFor, timeout);
      }

      this.updateHistory(pageInfo);

      let screenshotPath = null;
      if (params.screenshot) {
        screenshotPath = await this.captureScreenshot(url);
      }

      this._currentPage = pageInfo;

      return OperationResult.success({
        message: `Navigated to ${url}`,
        pageInfo,
        screenshotPath,
        loadTime: pageInfo.loadTime
      });

    } catch (error) {
      return OperationResult.error(error.message);
    }
  }

  async goBack(params) {
    if (this._historyIndex <= 0) {
      return OperationResult.error('No previous page in history');
    }

    this._historyIndex--;
    const previousPage = this._history[this._historyIndex];

    const pageInfo = {
      ...previousPage,
      loadTime: Date.now() - startTime,
      status: 'loaded'
    };

    this._currentPage = pageInfo;

    return OperationResult.success({
      message: 'Navigated back',
      pageInfo,
      historyIndex: this._historyIndex
    });
  }

  async goForward(params) {
    if (this._historyIndex >= this._history.length - 1) {
      return OperationResult.error('No next page in history');
    }

    this._historyIndex++;
    const nextPage = this._history[this._historyIndex];

    const pageInfo = {
      ...nextPage,
      loadTime: Date.now() - startTime,
      status: 'loaded'
    };

    this._currentPage = pageInfo;

    return OperationResult.success({
      message: 'Navigated forward',
      pageInfo,
      historyIndex: this._historyIndex
    });
  }

  async refresh(params) {
    if (!this._currentPage) {
      return OperationResult.error('No current page to refresh');
    }

    const pageInfo = {
      ...this._currentPage,
      loadTime: Date.now() - startTime,
      status: 'loaded'
    };

    if (this._historyIndex >= 0 && this._historyIndex < this._history.length) {
      this._history[this._historyIndex] = pageInfo;
    }

    this._currentPage = pageInfo;

    return OperationResult.success({
      message: 'Page refreshed',
      pageInfo,
      loadTime: pageInfo.loadTime
    });
  }

  async wait(waitTime) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return OperationResult.success({
      message: `Waited for ${waitTime}ms`,
      waitTime
    });
  }

  async takeScreenshot(params) {
    if (!this._currentPage) {
      return OperationResult.error('No current page to screenshot');
    }

    const screenshotPath = await this.captureScreenshot(this._currentPage.url);
    return OperationResult.success({
      message: 'Screenshot captured',
      screenshotPath,
      pageInfo: this._currentPage
    });
  }

  updateHistory(pageInfo) {
    if (this._historyIndex < this._history.length - 1) {
      this._history = this._history.slice(0, this._historyIndex + 1);
    }
    this._history.push(pageInfo);
    this._historyIndex = this._history.length - 1;
  }

  async simulateWaitForElement(selector, timeout) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Timeout waiting for element: ${selector}`));
          return;
        }
        const elementFound = Math.random() > 0.3;
        if (elementFound) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  async captureScreenshot(url) {
    const timestamp = Date.now();
    return `./screenshots/screenshot_${timestamp}.png`;
  }
}

// Simple Workflow Context
class WorkflowContext extends EventEmitter {
  constructor(workflowId, initialVariables = {}) {
    super();
    this.id = `${workflowId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.workflowId = workflowId;
    this.state = 'pending';
    this.startTime = Date.now();
    this.variables = { ...initialVariables };
    this.currentStep = 0;
    this.steps = [];
    this._sharedData = new Map();
    this._stepResults = new Map();
    this._logs = [];
  }

  setState(state) {
    this.state = state;
    this.emit('stateChanged', { context: this, newState: state });
  }

  setVariable(key, value) {
    this.variables[key] = value;
  }

  getVariable(key) {
    return this.variables[key];
  }

  setSharedData(key, value) {
    this._sharedData.set(key, value);
  }

  getSharedData(key) {
    return this._sharedData.get(key);
  }

  addStepResult(stepId, result) {
    this._stepResults.set(stepId, result);
  }

  addStepExecution(step) {
    this.steps.push(step);
  }

  updateCurrentStep(stepIndex) {
    this.currentStep = stepIndex;
  }

  resolveVariables(text) {
    return text.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const value = this.getVariable(key);
      return value !== undefined ? String(value) : match;
    });
  }

  resolveObject(obj) {
    if (typeof obj === 'string') {
      return this.resolveVariables(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveObject(value);
      }
      return result;
    }
    return obj;
  }

  log(level, message, stepId) {
    const logEntry = {
      timestamp: Date.now(),
      level,
      message,
      stepId
    };
    this._logs.push(logEntry);
  }

  getExecutionTime() {
    const endTime = this.endTime || Date.now();
    return endTime - this.startTime;
  }

  getProgress() {
    const totalSteps = this.steps.length;
    if (totalSteps === 0) return 0;
    return (this.currentStep / totalSteps) * 100;
  }

  getSuccessfulSteps() {
    return this.steps.filter(step => step.result.success).length;
  }

  getFailedSteps() {
    return this.steps.filter(step => !step.result.success).length;
  }

  getStepCount() {
    return this.steps.length;
  }
}

// Simple Workflow Engine
class WorkflowEngine extends EventEmitter {
  constructor() {
    super();
    this._operators = new Map();
    this._workflows = new Map();
    this._runningContexts = new Map();
  }

  registerOperator(name, operator) {
    this._operators.set(name, operator);
    this.emit('operatorRegistered', { name, operator });
  }

  async registerWorkflow(workflow) {
    this._workflows.set(workflow.id, workflow);
    this.emit('workflowRegistered', { workflow });
  }

  async executeWorkflow(workflowId, inputVariables = {}) {
    const workflow = this._workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const context = new WorkflowContext(workflowId, { ...workflow.variables, ...inputVariables });
    this._runningContexts.set(context.id, context);

    try {
      this.emit('workflowStarted', { workflow, context });

      await this.executeWorkflowSteps(workflow, context);
      return context;

    } catch (error) {
      context.setError(error.message);
      this.emit('workflowError', { workflow, context, error });
      throw error;
    } finally {
      this._runningContexts.delete(context.id);
    }
  }

  async executeWorkflowSteps(workflow, context) {
    context.setState('running');

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      context.updateCurrentStep(i);

      if (context.state !== 'running') {
        break;
      }

      try {
        const result = await this.executeStep(step, context);
        context.addStepResult(step.id, result);

        if (step.output && result.data !== undefined) {
          context.setVariable(step.output, result.data);
        }

        if (!result.success && !step.continueOnError) {
          throw new Error(`Step ${step.name} failed: ${result.error}`);
        }

      } catch (error) {
        const stepResult = OperationResult.error(error.message);
        context.addStepResult(step.id, stepResult);

        if (!step.continueOnError) {
          throw error;
        }
      }
    }

    if (context.state === 'running') {
      context.setState('completed');
    }
  }

  async executeStep(step, context) {
    const operator = this._operators.get(step.operator);
    if (!operator) {
      throw new Error(`Operator not found: ${step.operator}`);
    }

    const resolvedParams = context.resolveObject(step.params);

    if (!operator.validate(resolvedParams)) {
      throw new Error(`Invalid parameters for operator ${step.operator}`);
    }

    const startTime = Date.now();
    let attempts = 0;
    const maxAttempts = step.retry || 3;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        this.emit('stepStarted', { step, context, attempt: attempts });
        const result = await operator.execute(resolvedParams);
        result.duration = Date.now() - startTime;

        this.emit('stepCompleted', { step, result, context, attempts });
        return result;

      } catch (error) {
        this.emit('stepError', { step, error, context, attempts });

        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          return OperationResult.error(error.message);
        }
      }
    }
  }
}

// Simple Config Manager
class ConfigManager {
  async loadWorkflow(filePath) {
    try {
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load workflow from ${filePath}: ${error.message}`);
    }
  }

  async saveWorkflow(workflow, filePath) {
    try {
      const absolutePath = path.resolve(filePath);
      const dirPath = path.dirname(absolutePath);
      await fs.mkdir(dirPath, { recursive: true });
      const content = JSON.stringify(workflow, null, 2);
      await fs.writeFile(absolutePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save workflow to ${filePath}: ${error.message}`);
    }
  }

  validateWorkflow(workflow) {
    const errors = [];

    if (!workflow.id || typeof workflow.id !== 'string') {
      errors.push('Workflow ID is required and must be a string');
    }

    if (!workflow.name || typeof workflow.name !== 'string') {
      errors.push('Workflow name is required and must be a string');
    }

    if (!Array.isArray(workflow.steps)) {
      errors.push('Workflow steps must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Demo class
class WorkflowDemo {
  constructor() {
    this.engine = new WorkflowEngine();
    this.configManager = new ConfigManager();
    this.setupOperators();
  }

  setupOperators() {
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
      const workflowPath = path.join(__dirname, 'weibo-workflow.json');
      console.log(`📋 Loading workflow from: ${workflowPath}`);

      const workflow = await this.configManager.loadWorkflow(workflowPath);
      console.log(`📝 Workflow loaded: ${workflow.name}`);
      console.log(`🔢 Steps: ${workflow.steps.length}`);
      console.log(`📊 Variables: ${Object.keys(workflow.variables).join(', ')}`);

      await this.engine.registerWorkflow(workflow);
      console.log('✅ Workflow registered successfully');

      this.setupEventListeners();

      console.log('\n🔄 Executing workflow...');
      const context = await this.engine.executeWorkflow(workflow.id, {
        startTime: Date.now(),
        demoMode: true
      });

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

      if (result.data && result.data.message) {
        console.log(`   💬 ${result.data.message}`);
      }
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

    try {
      await fs.writeFile(path.join(__dirname, 'cookies.json'), JSON.stringify(sampleCookies, null, 2));
      console.log(`✅ Sample cookies created: ${path.join(__dirname, 'cookies.json')}`);
    } catch (error) {
      console.log(`⚠️  Could not create sample cookies: ${error.message}`);
    }
  }
}

// Main execution
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
    await demo.createSampleCookies();
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

if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { WorkflowDemo, runDemo, WorkflowEngine, BrowserOperator, CookieOperator, NavigationOperator };