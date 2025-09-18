"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationBasedBrowserAssistant = void 0;
__exportStar(require("./interfaces/IBrowserOperation"), exports);
__exportStar(require("./core/BrowserContextManager"), exports);
__exportStar(require("./core/BrowserWorkflowEngine"), exports);
__exportStar(require("./browser/BrowserLaunchOperationSimple"), exports);
// Main BrowserAssistant class for operation-based architecture
const BrowserOperationRegistry_1 = require("./core/BrowserOperationRegistry");
const BrowserContextManager_1 = require("./core/BrowserContextManager");
const BrowserWorkflowEngine_1 = require("./core/BrowserWorkflowEngine");
const BrowserLaunchOperationSimple_1 = require("./browser/BrowserLaunchOperationSimple");
class OperationBasedBrowserAssistant {
    operationRegistry;
    contextManager;
    workflowEngine;
    config;
    constructor(config = {}) {
        this.config = this.mergeConfig(config);
        this.operationRegistry = new BrowserOperationRegistry_1.BrowserOperationRegistry();
        this.contextManager = new BrowserContextManager_1.BrowserContextManager(this.config);
        this.workflowEngine = new BrowserWorkflowEngine_1.BrowserWorkflowEngine(this.operationRegistry, this.contextManager);
        this.initializeOperations();
    }
    mergeConfig(userConfig) {
        const defaultConfig = {
            browser: {
                type: 'camoufox',
                headless: false,
                viewport: { width: 1280, height: 720 }
            },
            cookies: {
                storagePath: './cookies',
                autoSave: true,
                domains: ['weibo.com', 's.weibo.com']
            },
            operations: {
                timeout: 30000,
                retryAttempts: 3,
                parallelLimit: 5
            },
            containers: {
                enabled: false
            }
        };
        return { ...defaultConfig, ...userConfig };
    }
    initializeOperations() {
        // Register all browser operations
        this.operationRegistry.registerOperation(new BrowserLaunchOperationSimple_1.BrowserLaunchOperation());
    }
    // Core workflow execution methods
    async executeWorkflow(workflow, contextId) {
        return await this.workflowEngine.executeWorkflow(workflow, contextId);
    }
    async navigateToUrl(url, contextId) {
        const workflow = BrowserWorkflowEngine_1.BrowserWorkflowEngine.createBasicNavigationWorkflow(url);
        return await this.workflowEngine.executeWorkflow(workflow, contextId);
    }
    async loginToWeibo(username, password, contextId) {
        const workflow = BrowserWorkflowEngine_1.BrowserWorkflowEngine.createWeiboLoginWorkflow(username, password);
        return await this.workflowEngine.executeWorkflow(workflow, contextId);
    }
    // Context management
    createContext(sessionId) {
        return this.contextManager.createContext(sessionId);
    }
    getContext(sessionId) {
        return this.contextManager.getContext(sessionId);
    }
    removeContext(sessionId) {
        return this.contextManager.removeContext(sessionId);
    }
    // Operation management
    registerOperation(operation) {
        this.operationRegistry.registerOperation(operation);
    }
    getOperation(name) {
        return this.operationRegistry.getOperation(name);
    }
    listOperations() {
        return this.operationRegistry.listOperations();
    }
    // Configuration
    updateConfig(config) {
        this.config = this.mergeConfig(config);
    }
    getConfig() {
        return this.config;
    }
    // Health check
    async getHealthStatus() {
        return {
            name: 'OperationBasedBrowserAssistant',
            version: '1.0.0',
            operationCount: this.operationRegistry.size,
            contextCount: this.contextManager.listContexts().length,
            config: this.config,
            status: 'healthy',
            timestamp: new Date().toISOString()
        };
    }
}
exports.OperationBasedBrowserAssistant = OperationBasedBrowserAssistant;
//# sourceMappingURL=index.js.map