import { BaseOperation, OperationContext, OperationResult } from '../core/BaseOperationSimple';
import { BrowserOperationContext } from '../interfaces/IBrowserOperation';
export interface BrowserLaunchParams {
    headless?: boolean;
    userAgent?: string;
    viewport?: {
        width: number;
        height: number;
    };
    browserType?: 'camoufox' | 'playwright';
}
export declare class BrowserLaunchOperation extends BaseOperation {
    name: string;
    description: string;
    version: string;
    author: string;
    abstractCategories: string[];
    supportedContainers: string[];
    capabilities: string[];
    execute(context: BrowserOperationContext, params?: BrowserLaunchParams): Promise<OperationResult>;
    validate(context: OperationContext, params?: BrowserLaunchParams): any;
    getCapabilities(): {
        supportedContentTypes: string[];
        supportedLanguages: string[];
        maxContentSize: number;
        processingSpeed: string;
        isRealtime: boolean;
        requiresInternet: boolean;
        requiresBrowser: boolean;
    };
}
