"use strict";
/**
 * WebAuto Browser Assistant - Simplified Version
 * 智能浏览器自动化助手，基于 Camoufox 和基本页面操作
 *
 * @module @webauto/browser-assistant
 */
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
exports.name = exports.version = exports.createBrowserAssistant = exports.WebSocketError = exports.AIError = exports.CookieError = exports.AnalysisError = exports.NavigationTimeoutError = exports.ElementNotFoundError = exports.BrowserConnectionError = exports.BrowserAssistantError = exports.SmartElementSelector = exports.PageOperationCenter = exports.CookieManager = exports.CamoufoxManager = exports.BaseBrowserModule = void 0;
// Core exports
var SimpleBaseModule_1 = require("./core/SimpleBaseModule");
Object.defineProperty(exports, "BaseBrowserModule", { enumerable: true, get: function () { return SimpleBaseModule_1.BaseBrowserModule; } });
// Browser components
var CamoufoxManager_1 = require("./browser/CamoufoxManager");
Object.defineProperty(exports, "CamoufoxManager", { enumerable: true, get: function () { return CamoufoxManager_1.CamoufoxManager; } });
var SimpleCookieManager_1 = require("./browser/SimpleCookieManager");
Object.defineProperty(exports, "CookieManager", { enumerable: true, get: function () { return SimpleCookieManager_1.CookieManager; } });
// Operations
var SimplePageOperationCenter_1 = require("./operations/SimplePageOperationCenter");
Object.defineProperty(exports, "PageOperationCenter", { enumerable: true, get: function () { return SimplePageOperationCenter_1.PageOperationCenter; } });
var SimpleSmartElementSelector_1 = require("./operations/SimpleSmartElementSelector");
Object.defineProperty(exports, "SmartElementSelector", { enumerable: true, get: function () { return SimpleSmartElementSelector_1.SmartElementSelector; } });
// Error handling
var errors_1 = require("./errors");
Object.defineProperty(exports, "BrowserAssistantError", { enumerable: true, get: function () { return errors_1.BrowserAssistantError; } });
Object.defineProperty(exports, "BrowserConnectionError", { enumerable: true, get: function () { return errors_1.BrowserConnectionError; } });
Object.defineProperty(exports, "ElementNotFoundError", { enumerable: true, get: function () { return errors_1.ElementNotFoundError; } });
Object.defineProperty(exports, "NavigationTimeoutError", { enumerable: true, get: function () { return errors_1.NavigationTimeoutError; } });
Object.defineProperty(exports, "AnalysisError", { enumerable: true, get: function () { return errors_1.AnalysisError; } });
Object.defineProperty(exports, "CookieError", { enumerable: true, get: function () { return errors_1.CookieError; } });
Object.defineProperty(exports, "AIError", { enumerable: true, get: function () { return errors_1.AIError; } });
Object.defineProperty(exports, "WebSocketError", { enumerable: true, get: function () { return errors_1.WebSocketError; } });
// Types
__exportStar(require("./types"), exports);
// Convenience functions
const createBrowserAssistant = (config) => {
    // Dynamic import to avoid circular reference
    const { CamoufoxManager } = require('./browser/CamoufoxManager');
    return new CamoufoxManager(config);
};
exports.createBrowserAssistant = createBrowserAssistant;
// Version info
exports.version = '0.1.0';
exports.name = '@webauto/browser-assistant';
// Default export
exports.default = {
    get CamoufoxManager() { return require('./browser/CamoufoxManager').CamoufoxManager; },
    get PageOperationCenter() { return require('./operations/SimplePageOperationCenter').PageOperationCenter; },
    get SmartElementSelector() { return require('./operations/SimpleSmartElementSelector').SmartElementSelector; },
    get CookieManager() { return require('./browser/SimpleCookieManager').CookieManager; },
    createBrowserAssistant: exports.createBrowserAssistant,
    version: exports.version,
    name: exports.name
};
//# sourceMappingURL=index-simple.js.map