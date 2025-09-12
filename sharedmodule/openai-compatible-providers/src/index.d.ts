/**
 * OpenAI Compatible Providers Framework
 * 自动生成的类型定义文件
 */

export interface ProviderConfig {
  name: string;
  endpoint: string;
  supportedModels: string[];
  defaultModel: string;
  apiKey?: string;
  timeout?: number;
  [key: string]: any;
}

export interface CompatibilityConfig {
  providerName: string;
  fieldMappings: {
    request: Record<string, any>;
    response: Record<string, any>;
  };
  [key: string]: any;
}

export class ProviderFramework {
  constructor(config?: any);
  chat(providerName: string, request: any): Promise<any>;
  streamChat(providerName: string, request: any): AsyncIterable<any>;
  healthCheck(): Promise<any>;
  getAllProviders(): Record<string, any>;
  getProvider(providerName: string): any;
}

export class BaseProvider {
  constructor(config: ProviderConfig);
  chat(request: any, compatibility?: any): Promise<any>;
  streamChat(request: any, compatibility?: any): AsyncIterable<any>;
  executeChat(request: any): Promise<any>;
  executeStreamChat(request: any): AsyncIterable<any>;
  getCapabilities(): any;
  healthCheck(): Promise<any>;
}

export class ModuleScanner {
  scan(scanPaths: string[], moduleType: string): any[];
  scanDirectory(directory: string, moduleType: string): any[];
  loadModule(modulePath: string, moduleType: string, config?: any): any;
}

export class ICompatibility {
  constructor(config: CompatibilityConfig);
  mapRequest(openaiRequest: any): any;
  mapResponse(providerResponse: any): any;
}

export class IAuthManager {
  authenticate(credentials: any): Promise<any>;
  getAuthHeaders(): Promise<Record<string, string>>;
}