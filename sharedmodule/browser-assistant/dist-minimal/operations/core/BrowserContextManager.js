"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserContextManager = void 0;
class Logger {
    name;
    constructor(name) {
        this.name = name;
    }
    info(message, data) {
        console.log(`[${this.name}] ${message}`, data || '');
    }
    warn(message, data) {
        console.warn(`[${this.name}] ${message}`, data || '');
    }
    error(message, data) {
        console.error(`[${this.name}] ${message}`, data || '');
    }
    debug(message, data) {
        console.debug(`[${this.name}] ${message}`, data || '');
    }
}
class BrowserContextManager {
    contexts = new Map();
    config;
    constructor(config) {
        this.config = config;
    }
    createContext(sessionId) {
        const context = {
            id: sessionId,
            browser: null,
            page: null,
            metadata: {
                startTime: new Date(),
                userAgent: this.config.browser.userAgent,
                viewport: this.config.browser.viewport,
                config: this.config
            },
            logger: new Logger(`BrowserContext-${sessionId}`),
            eventBus: this.createEventBus(),
            cookies: new Map(),
            selectors: new Map()
        };
        this.contexts.set(sessionId, context);
        return context;
    }
    getContext(sessionId) {
        return this.contexts.get(sessionId);
    }
    updateContext(sessionId, updates) {
        const context = this.contexts.get(sessionId);
        if (context) {
            Object.assign(context, updates);
        }
    }
    removeContext(sessionId) {
        return this.contexts.delete(sessionId);
    }
    listContexts() {
        return Array.from(this.contexts.keys());
    }
    clearAll() {
        this.contexts.clear();
    }
    createEventBus() {
        return {
            emit: (event, data) => {
                // Simple event bus implementation
                console.log(`[Event] ${event}:`, data);
            },
            on: (event, handler) => {
                // Event listener registration
                process.on?.(event, handler);
            },
            off: (event, handler) => {
                // Event listener removal
                process.off?.(event, handler);
            }
        };
    }
}
exports.BrowserContextManager = BrowserContextManager;
//# sourceMappingURL=BrowserContextManager.js.map