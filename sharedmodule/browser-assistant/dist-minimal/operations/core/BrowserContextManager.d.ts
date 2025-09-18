import { BrowserOperationContext, BrowserOperationConfig } from '../interfaces/IBrowserOperation';
export { BrowserOperationConfig };
export declare class BrowserContextManager {
    private contexts;
    private config;
    constructor(config: BrowserOperationConfig);
    createContext(sessionId: string): BrowserOperationContext;
    getContext(sessionId: string): BrowserOperationContext | undefined;
    updateContext(sessionId: string, updates: Partial<BrowserOperationContext>): void;
    removeContext(sessionId: string): boolean;
    listContexts(): string[];
    clearAll(): void;
    private createEventBus;
}
