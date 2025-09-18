#!/usr/bin/env node

/**
 * Browser Operator Node
 * Manages browser instances and provides browser functionality to other nodes
 */

const { BaseNode } = require('../base-node');
const { RealBrowserOperator } = require('../../cli/real-browser-operator');

class BrowserOperatorNode extends BaseNode {
    constructor(nodeId, config) {
        super(nodeId, config);
        this.browserOperator = null;
    }

    async execute(context, params) {
        const startTime = Date.now();

        try {
            this.emit('log', { level: 'info', message: `Starting browser operator node: ${this.id}` });

            // Initialize browser operator if not already done
            if (!this.browserOperator) {
                this.browserOperator = new RealBrowserOperator();

                // Get browser configuration from parameters or inputs
                const browserConfig = this.getInput(context, 'config') || params || {};

                // Start browser with configuration
                const startResult = await this.browserOperator.startBrowser(browserConfig);

                if (!startResult.success) {
                    throw new Error(`Failed to start browser: ${startResult.error}`);
                }

                this.emit('log', {
                    level: 'info',
                    message: `Browser started successfully: ${startResult.data.browserType} on port ${startResult.data.port}`
                });
            }

            // Check if we need to load cookies
            const cookies = this.getInput(context, 'cookies');
            if (cookies && Array.isArray(cookies)) {
                await this.browserOperator.loadCookies({ cookies });
                this.emit('log', { level: 'info', message: `Loaded ${cookies.length} cookies` });
            }

            // Get current page and browser
            const page = this.browserOperator.getPage();
            const browser = this.browserOperator.getBrowser();

            // Set outputs
            this.setOutput(context, 'page', page);
            this.setOutput(context, 'browser', browser);

            const result = {
                success: true,
                message: 'Browser operator initialized successfully',
                data: {
                    browserType: this.browserOperator.config.browserType || 'chromium',
                    headless: this.browserOperator.config.headless !== false,
                    page: page ? 'available' : 'not available',
                    browser: browser ? 'available' : 'not available'
                },
                executionTime: Date.now() - startTime
            };

            this.emit('log', { level: 'info', message: `Browser operator node completed: ${this.id}` });
            return result;

        } catch (error) {
            const errorResult = {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime
            };

            this.emit('log', {
                level: 'error',
                message: `Browser operator node failed: ${this.id} - ${error.message}`
            });
            return errorResult;
        }
    }

    // Additional browser-specific methods
    async navigate(context, url, options = {}) {
        if (!this.browserOperator) {
            throw new Error('Browser not initialized');
        }

        const result = await this.browserOperator.navigateTo({
            url,
            ...options
        });

        if (result.success) {
            this.setOutput(context, 'page', this.browserOperator.getPage());
        }

        return result;
    }

    async takeScreenshot(context, filePath) {
        if (!this.browserOperator) {
            throw new Error('Browser not initialized');
        }

        const result = await this.browserOperator.takeScreenshot({
            path: filePath
        });

        return result;
    }

    async close() {
        if (this.browserOperator) {
            await this.browserOperator.stopBrowser();
            this.browserOperator = null;
        }
    }

    emit(eventName, data) {
        // Simple event emission - in a real implementation, you might want to use EventEmitter
        if (this._eventHandlers && this._eventHandlers[eventName]) {
            this._eventHandlers[eventName].forEach(handler => handler(data));
        }
    }

    on(eventName, handler) {
        if (!this._eventHandlers) {
            this._eventHandlers = {};
        }
        if (!this._eventHandlers[eventName]) {
            this._eventHandlers[eventName] = [];
        }
        this._eventHandlers[eventName].push(handler);
    }
}

module.exports = BrowserOperatorNode;