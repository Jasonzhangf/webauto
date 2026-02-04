export interface OperationLogEntry {
    kind: string;
    action?: string;
    sessionId?: string;
    context?: string;
    reason?: string;
    payload?: Record<string, any> | null;
    result?: Record<string, any> | null;
    target?: Record<string, any> | null;
    meta?: Record<string, any> | null;
    opId?: number;
}
export interface ErrorLogEntry {
    kind: string;
    action?: string;
    sessionId?: string;
    context?: string;
    reason?: string;
    error?: string;
    payload?: Record<string, any> | null;
    meta?: Record<string, any> | null;
    opId?: number;
}
export declare function logOperation(entry: OperationLogEntry): number;
export declare function logError(entry: ErrorLogEntry): number;
export declare function logControllerActionStart(action: string, payload: any, meta?: Record<string, any>): number;
export declare function logControllerActionResult(opId: number, action: string, result: any, meta?: Record<string, any>): void;
export declare function logControllerActionError(opId: number, action: string, error: unknown, payload: any, meta?: Record<string, any>): void;
//# sourceMappingURL=operationLogger.d.ts.map