import { IBrowserOperation } from '../interfaces/IBrowserOperation';
export declare class BrowserOperationRegistry {
    private operations;
    constructor();
    private registerDefaultOperations;
    registerOperation(operation: IBrowserOperation): void;
    getOperation(name: string): IBrowserOperation | undefined;
    listOperations(): string[];
    get size(): number;
    hasOperation(name: string): boolean;
    removeOperation(name: string): boolean;
    clear(): void;
    getOperationsByCategory(category: string): IBrowserOperation[];
    getOperationsByCapability(capability: string): IBrowserOperation[];
    unregisterOperation(name: string): boolean;
}
