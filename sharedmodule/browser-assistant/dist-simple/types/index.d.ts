import { z } from 'zod';
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
export declare const ObservedElementSchema: z.ZodObject<{
    selector: z.ZodString;
    description: z.ZodString;
    method: z.ZodString;
    arguments: z.ZodArray<z.ZodString, "many">;
    elementId: z.ZodString;
    confidence: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    selector: string;
    method: string;
    description: string;
    arguments: string[];
    elementId: string;
    metadata?: Record<string, unknown> | undefined;
    confidence?: number | undefined;
}, {
    selector: string;
    method: string;
    description: string;
    arguments: string[];
    elementId: string;
    metadata?: Record<string, unknown> | undefined;
    confidence?: number | undefined;
}>;
export declare const ObserveOptionsSchema: z.ZodObject<{
    instruction: z.ZodOptional<z.ZodString>;
    selector: z.ZodOptional<z.ZodString>;
    includeMetadata: z.ZodDefault<z.ZodBoolean>;
    confidenceThreshold: z.ZodDefault<z.ZodNumber>;
    returnAction: z.ZodDefault<z.ZodBoolean>;
    onlyVisible: z.ZodOptional<z.ZodBoolean>;
    drawOverlay: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    includeMetadata: boolean;
    confidenceThreshold: number;
    returnAction: boolean;
    drawOverlay: boolean;
    selector?: string | undefined;
    instruction?: string | undefined;
    onlyVisible?: boolean | undefined;
}, {
    selector?: string | undefined;
    instruction?: string | undefined;
    includeMetadata?: boolean | undefined;
    confidenceThreshold?: number | undefined;
    returnAction?: boolean | undefined;
    onlyVisible?: boolean | undefined;
    drawOverlay?: boolean | undefined;
}>;
export declare const PageAnalysisSchema: z.ZodObject<{
    url: z.ZodString;
    title: z.ZodString;
    type: z.ZodEnum<["article", "product", "form", "navigation", "search", "unknown"]>;
    mainContent: z.ZodOptional<z.ZodObject<{
        selector: z.ZodString;
        description: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        selector: string;
        description: string;
    }, {
        selector: string;
        description: string;
    }>>;
    keyElements: z.ZodArray<z.ZodObject<{
        selector: z.ZodString;
        description: z.ZodString;
        method: z.ZodString;
        arguments: z.ZodArray<z.ZodString, "many">;
        elementId: z.ZodString;
        confidence: z.ZodOptional<z.ZodNumber>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        selector: string;
        method: string;
        description: string;
        arguments: string[];
        elementId: string;
        metadata?: Record<string, unknown> | undefined;
        confidence?: number | undefined;
    }, {
        selector: string;
        method: string;
        description: string;
        arguments: string[];
        elementId: string;
        metadata?: Record<string, unknown> | undefined;
        confidence?: number | undefined;
    }>, "many">;
    suggestedOperations: z.ZodArray<z.ZodObject<{
        operation: z.ZodAny;
        confidence: z.ZodNumber;
        reasoning: z.ZodString;
        parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        confidence: number;
        reasoning: string;
        parameters: Record<string, unknown>;
        operation?: any;
    }, {
        confidence: number;
        reasoning: string;
        parameters: Record<string, unknown>;
        operation?: any;
    }>, "many">;
    metadata: z.ZodObject<{
        loadTime: z.ZodNumber;
        elementCount: z.ZodNumber;
        interactiveElements: z.ZodNumber;
        accessibilityScore: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        loadTime: number;
        elementCount: number;
        interactiveElements: number;
        accessibilityScore?: number | undefined;
    }, {
        loadTime: number;
        elementCount: number;
        interactiveElements: number;
        accessibilityScore?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    title: string;
    metadata: {
        loadTime: number;
        elementCount: number;
        interactiveElements: number;
        accessibilityScore?: number | undefined;
    };
    type: "search" | "article" | "form" | "product" | "navigation" | "unknown";
    url: string;
    keyElements: {
        selector: string;
        method: string;
        description: string;
        arguments: string[];
        elementId: string;
        metadata?: Record<string, unknown> | undefined;
        confidence?: number | undefined;
    }[];
    suggestedOperations: {
        confidence: number;
        reasoning: string;
        parameters: Record<string, unknown>;
        operation?: any;
    }[];
    mainContent?: {
        selector: string;
        description: string;
    } | undefined;
}, {
    title: string;
    metadata: {
        loadTime: number;
        elementCount: number;
        interactiveElements: number;
        accessibilityScore?: number | undefined;
    };
    type: "search" | "article" | "form" | "product" | "navigation" | "unknown";
    url: string;
    keyElements: {
        selector: string;
        method: string;
        description: string;
        arguments: string[];
        elementId: string;
        metadata?: Record<string, unknown> | undefined;
        confidence?: number | undefined;
    }[];
    suggestedOperations: {
        confidence: number;
        reasoning: string;
        parameters: Record<string, unknown>;
        operation?: any;
    }[];
    mainContent?: {
        selector: string;
        description: string;
    } | undefined;
}>;
//# sourceMappingURL=index.d.ts.map