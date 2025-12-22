

/**
 * Browser Operator Node
 * Manages browser instances and provides browser functionality to other nodes
 */

import { BaseNode } from '../base-node';

class BrowserOperatorNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);
    constructor(nodeId: string, config: any) {
        super(nodeId, config);
        this.browser = null;
        this.page = null;
    }

    async execute(context, params) {
        try {
            this.log('info', 'Initializing browser operator');

            // Simplified browser initialization
            // In a real implementation, this would use Playwright or Puppeteer
            this.browser = {
                initialized: true,
                userAgent: 'WebAuto-NodeSystem/1.0'
            };

            // Create a mock page object with necessary methods
            let pageTitle = 'New Page';
            let pageUrl = null;

            const pageObj = {
                url: null,
                title: 'New Page',
                content: null,
                isClosed: () => false,
                goto: async (url) => {
                    pageUrl = url;
                    pageTitle = 'Mock Page - ' + url;
                    pageObj.url = pageUrl;
                    pageObj.title = pageTitle;
                    return { status: () => 200 };
                },
                title: async () => pageTitle,
                url: () => pageUrl,
                waitForSelector: async (selector, options) => {
                    // Mock wait for selector
                    await new Promise(resolve => setTimeout(resolve, 100));
                },
                evaluate: async (fn, ...args) => {
                    // Mock evaluate function - simulate Weibo DOM environment
                    if (typeof fn === 'function') {
                        // Create mock Weibo feed elements
                        const mockFeedElements = [
                            {
                                tagName: 'DIV',
                                className: 'Feed_body_3R0rO Feed_body_2ISJX',
                                id: 'feed1',
                                textContent: 'Mock Weibo post 1 with some content and links',
                                children: [{ length: 5 }],
                                offsetParent: { tagName: 'DIV' },
                                getBoundingClientRect: () => ({ width: 500, height: 300, top: 100, left: 50 }),
                                querySelectorAll: (selector) => {
                                    if (selector.includes('a') || selector.includes('href')) {
                                        return [
                                            {
                                                href: 'https://weibo.com/1234567890/AbCdEfGhIj',
                                                textContent: 'Mock post link 1',
                                                tagName: 'A',
                                                className: 'link'
                                            },
                                            {
                                                href: 'https://weibo.com/1234567890/AbCdEfGhIj/comments',
                                                textContent: 'Comments',
                                                tagName: 'A',
                                                className: 'comment-link'
                                            }
                                        ];
                                    }
                                    return [];
                                }
                            },
                            {
                                tagName: 'DIV',
                                className: 'Feed_body_3R0rO',
                                id: 'feed2',
                                textContent: 'Mock Weibo post 2 with different content',
                                children: [{ length: 3 }],
                                offsetParent: { tagName: 'DIV' },
                                getBoundingClientRect: () => ({ width: 500, height: 250, top: 420, left: 50 }),
                                querySelectorAll: (selector) => {
                                    if (selector.includes('a') || selector.includes('href')) {
                                        return [
                                            {
                                                href: 'https://weibo.com/1234567890/XyZaBcDeFg',
                                                textContent: 'Mock post link 2',
                                                tagName: 'A',
                                                className: 'link'
                                            }
                                        ];
                                    }
                                    return [];
                                }
                            }
                        ];

                        const mockDocument = {
                            querySelectorAll: (selector) => {
                                if (selector.includes('Feed') || selector.includes('feed')) {
                                    return mockFeedElements;
                                }
                                return [];
                            },
                            querySelector: (selector) => {
                                return mockFeedElements[0] || null;
                            }
                        };

                        // Create mock window object
                        const mockWindow = {
                            console: console,
                            Date: Date,
                            setTimeout: setTimeout,
                            clearTimeout: clearTimeout
                        };

                        // Call the function with proper this context
                        const mockContext = {
                            document: mockDocument,
                            window: mockWindow,
                            console: console,
                            Date: Date
                        };

                        return fn.apply(mockContext, args);
                    }
                    return null;
                },
                on: (event, handler) => {
                    // Mock event listener
                }
            };

            this.page = pageObj;

            // Set outputs
            this.setOutput(context, 'page', this.page);
            this.setOutput(context, 'browser', this.browser);

            this.log('info', 'Browser operator initialized successfully');

            return {
                success: true,
                browser: this.browser,
                page: this.page
            };

        } catch (error) {
            this.log('error', `Browser operator failed: ${error.message}`);
            throw error;
        }
    }

    log(level, message) {
        console.log(`[${level.toUpperCase()}] BrowserOperatorNode: ${message}`);
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

export default BrowserOperatorNode;