"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserOperationRegistry = void 0;
const BrowserLaunchOperationSimple_1 = require("../browser/BrowserLaunchOperationSimple");
class BrowserOperationRegistry {
    operations = new Map();
    constructor() {
        this.registerDefaultOperations();
    }
    registerDefaultOperations() {
        this.registerOperation(new BrowserLaunchOperationSimple_1.BrowserLaunchOperation());
    }
    registerOperation(operation) {
        this.operations.set(operation.name, operation);
    }
    getOperation(name) {
        return this.operations.get(name);
    }
    listOperations() {
        return Array.from(this.operations.keys());
    }
    get size() {
        return this.operations.size;
    }
    hasOperation(name) {
        return this.operations.has(name);
    }
    removeOperation(name) {
        return this.operations.delete(name);
    }
    clear() {
        this.operations.clear();
    }
    getOperationsByCategory(category) {
        return Array.from(this.operations.values()).filter(op => op.abstractCategories?.includes(category));
    }
    getOperationsByCapability(capability) {
        return Array.from(this.operations.values()).filter(op => op.capabilities?.includes(capability));
    }
    unregisterOperation(name) {
        return this.operations.delete(name);
    }
}
exports.BrowserOperationRegistry = BrowserOperationRegistry;
//# sourceMappingURL=BrowserOperationRegistrySimple.js.map