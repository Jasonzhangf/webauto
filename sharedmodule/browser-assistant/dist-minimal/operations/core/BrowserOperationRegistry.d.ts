import { IBrowserOperation } from '../interfaces/IBrowserOperation';
export declare class BrowserOperationRegistry {
    private operations;
    registerOperation(operation: IBrowserOperation): void;
    getOperation(name: string): IBrowserOperation | undefined;
    getOperationsByCategory(category: string): IBrowserOperation[];
    listOperations(): string[];
    unregisterOperation(name: string): boolean;
    clear(): void;
    get size(): number;
}
