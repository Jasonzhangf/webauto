export interface BrowserConfig {
    headless?: boolean;
    viewport?: {
        width: number;
        height: number;
    };
    locale?: string[];
    userAgent?: string;
    cookies?: Array<{
        name: string;
        value: string;
        domain: string;
        path?: string;
        expires?: number;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: 'Strict' | 'Lax' | 'None';
    }>;
}
export interface ObservedElement {
    selector: string;
    description: string;
    method: string;
    arguments: string[];
    elementId: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
}
export interface ObserveOptions {
    instruction?: string;
    selector?: string;
    includeMetadata?: boolean;
    confidenceThreshold?: number;
    returnAction?: boolean;
    onlyVisible?: boolean;
    drawOverlay?: boolean;
}
export interface ObserveResult {
    elements: ObservedElement[];
    timestamp: string;
    url: string;
    metadata?: {
        title?: string;
        description?: string;
        accessibilityScore?: number;
    };
}
export interface PageOperation {
    id: string;
    name: string;
    description: string;
    parameters: Array<{
        name: string;
        type: string;
        description: string;
        required: boolean;
        defaultValue?: unknown;
    }>;
    execute: (params: Record<string, unknown>) => Promise<unknown>;
}
export interface OperationSuggestion {
    operation: PageOperation;
    confidence: number;
    reasoning: string;
    parameters: Record<string, unknown>;
}
export interface PageAnalysis {
    url: string;
    title: string;
    type: 'article' | 'product' | 'form' | 'navigation' | 'search' | 'unknown';
    mainContent?: {
        selector: string;
        description: string;
    };
    keyElements: ObservedElement[];
    suggestedOperations: OperationSuggestion[];
    metadata: {
        loadTime: number;
        elementCount: number;
        interactiveElements: number;
        accessibilityScore?: number;
    };
}
export interface CookieDomain {
    domain: string;
    cookies: Array<{
        name: string;
        value: string;
        expires?: number;
        secure: boolean;
        httpOnly: boolean;
        sameSite: 'Strict' | 'Lax' | 'None';
    }>;
    lastAccessed: string;
}
export interface WebSocketMessage {
    type: 'command' | 'event' | 'response' | 'error';
    id: string;
    payload: unknown;
    timestamp: string;
}
export interface InjectedTool {
    name: string;
    script: string;
    description: string;
    enabled: boolean;
}
export interface PageToolsConfig {
    enableHighlight: boolean;
    enableWebSocket: boolean;
    enableCookieManager: boolean;
    customTools?: InjectedTool[];
}
export declare const ObservedElementSchema: any;
export declare const ObserveOptionsSchema: any;
export declare const PageAnalysisSchema: any;
//# sourceMappingURL=index.d.ts.map