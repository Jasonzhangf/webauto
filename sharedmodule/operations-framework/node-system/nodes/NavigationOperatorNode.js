#!/usr/bin/env node

/**
 * Navigation Operator Node
 * Handles page navigation and wait operations
 */

const { BaseNode } = require('../base-node');

class NavigationOperatorNode extends BaseNode {
    constructor(nodeId, config) {
        super(nodeId, config);
        this.navigationResult = null;
    }

    async execute(context, params) {
        const startTime = Date.now();

        try {
            this.emit('log', { level: 'info', message: `Starting navigation operator node: ${this.id}` });

            // Get inputs
            const page = this.getInput(context, 'page');
            if (!page) {
                throw new Error('Page input is required');
            }

            // Get navigation parameters
            const url = this.getInput(context, 'url') || params.url;
            if (!url) {
                throw new Error('URL is required for navigation');
            }

            const waitUntil = params.waitUntil || 'domcontentloaded';
            const timeout = params.timeout || 30000;
            const retryCount = params.retryCount || 3;

            this.emit('log', {
                level: 'info',
                message: `Navigating to: ${url}`
            });

            // Perform navigation with retry logic
            let result = null;
            let lastError = null;

            for (let attempt = 1; attempt <= retryCount; attempt++) {
                try {
                    result = await this.performNavigation(page, url, {
                        waitUntil,
                        timeout
                    });

                    if (result.success) {
                        this.emit('log', {
                            level: 'info',
                            message: `Navigation successful on attempt ${attempt}`
                        });
                        break;
                    } else {
                        lastError = result.error;
                        this.emit('log', {
                            level: 'warn',
                            message: `Navigation attempt ${attempt} failed: ${result.error}`
                        });
                    }

                } catch (error) {
                    lastError = error.message;
                    this.emit('log', {
                        level: 'warn',
                        message: `Navigation attempt ${attempt} error: ${error.message}`
                    });
                }

                // Wait before retry
                if (attempt < retryCount) {
                    await this.delay(1000 * attempt);
                }
            }

            if (!result || !result.success) {
                throw new Error(`Navigation failed after ${retryCount} attempts: ${lastError}`);
            }

            this.navigationResult = result;

            // Set outputs
            this.setOutput(context, 'page', page);
            this.setOutput(context, 'navigationResult', result);

            const executionResult = {
                success: true,
                message: `Successfully navigated to ${url}`,
                data: {
                    url,
                    title: result.data?.title || 'Unknown',
                    loadTime: result.data?.loadTime || 0,
                    finalUrl: result.data?.finalUrl || url,
                    status: result.data?.status || 'unknown'
                },
                executionTime: Date.now() - startTime
            };

            this.emit('log', { level: 'info', message: `Navigation operator node completed: ${this.id}` });
            return executionResult;

        } catch (error) {
            const errorResult = {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime
            };

            this.setOutput(context, 'page', null);
            this.setOutput(context, 'navigationResult', { error: error.message });

            this.emit('log', {
                level: 'error',
                message: `Navigation operator node failed: ${this.id} - ${error.message}`
            });
            return errorResult;
        }
    }

    async performNavigation(page, url, options) {
        const startTime = Date.now();

        try {
            // Check if page is still valid
            if (page.isClosed()) {
                throw new Error('Page is closed');
            }

            // Set up event listeners for navigation
            const navigationPromises = this.setupNavigationListeners(page);

            // Navigate to URL
            const response = await page.goto(url, {
                waitUntil: options.waitUntil,
                timeout: options.timeout
            });

            const loadTime = Date.now() - startTime;

            // Wait for navigation promises to settle
            await Promise.race([
                Promise.all(navigationPromises),
                new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
            ]);

            // Get page information
            const title = await page.title().catch(() => 'Unknown');
            const finalUrl = page.url();

            return {
                success: true,
                data: {
                    url,
                    finalUrl,
                    title,
                    loadTime,
                    status: response?.status() || 'unknown',
                    responseHeaders: response?.headers() || {}
                }
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: {
                    url,
                    loadTime: Date.now() - startTime
                }
            };
        }
    }

    setupNavigationListeners(page) {
        const promises = [];

        // Listen for console events
        promises.push(new Promise((resolve) => {
            page.on('console', (msg) => {
                if (msg.type() === 'error') {
                    this.emit('log', {
                        level: 'warn',
                        message: `Console error: ${msg.text()}`
                    });
                }
            });
            setTimeout(resolve, 1000); // Resolve after 1 second
        }));

        // Listen for page errors
        promises.push(new Promise((resolve) => {
            page.on('pageerror', (error) => {
                this.emit('log', {
                    level: 'error',
                    message: `Page error: ${error.message}`
                });
            });
            setTimeout(resolve, 1000);
        }));

        return promises;
    }

    // Wait for specific conditions
    async waitForCondition(page, condition, timeout = 30000) {
        try {
            switch (condition.type) {
                case 'selector':
                    await page.waitForSelector(condition.selector, { timeout });
                    break;
                case 'navigation':
                    await page.waitForNavigation({ waitUntil: condition.waitUntil || 'load', timeout });
                    break;
                case 'function':
                    await page.waitForFunction(condition.function, { timeout }, ...condition.args || []);
                    break;
                case 'timeout':
                    await page.waitForTimeout(condition.duration || timeout);
                    break;
                default:
                    throw new Error(`Unknown condition type: ${condition.type}`);
            }

            return { success: true };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Take screenshot before/after navigation
    async takeScreenshot(page, filename) {
        try {
            const screenshotPath = filename || `screenshot-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            this.emit('log', {
                level: 'info',
                message: `Screenshot saved: ${screenshotPath}`
            });
            return screenshotPath;
        } catch (error) {
            this.emit('log', {
                level: 'warn',
                message: `Failed to take screenshot: ${error.message}`
            });
            return null;
        }
    }

    // Get page information
    async getPageInfo(page) {
        try {
            const title = await page.title();
            const url = page.url();
            const content = await page.content();

            return {
                title,
                url,
                contentLength: content.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.emit('log', {
                level: 'warn',
                message: `Failed to get page info: ${error.message}`
            });
            return null;
        }
    }

    // Utility delay function
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Method to get last navigation result
    getLastNavigationResult() {
        return this.navigationResult;
    }

    emit(eventName, data) {
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

module.exports = NavigationOperatorNode;