"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserOperationRegistry = void 0;
class BrowserOperationRegistry {
    operations = new Map();
    registerOperation(operation) {
        this.operations.set(operation.name, operation);
    }
    getOperation(name) {
        return this.operations.get(name);
    }
    getOperationsByCategory(category) {
        return Array.from(this.operations.values())
            .filter(op => op.abstractCategories?.includes(category));
    }
    listOperations() {
        return Array.from(this.operations.keys());
    }
    unregisterOperation(name) {
        return this.operations.delete(name);
    }
    clear() {
        this.operations.clear();
    }
    get size() {
        return this.operations.size;
    }
}
exports.BrowserOperationRegistry = BrowserOperationRegistry;
//# sourceMappingURL=BrowserOperationRegistry.js.map