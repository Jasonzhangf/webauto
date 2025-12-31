export interface BrowserCommandOptions {
  action: string;
  args?: Record<string, any>;
}

export interface BrowserServiceConfig {
  host?: string;
  port?: number;
}

export class BrowserService {
  constructor(config?: BrowserServiceConfig);
  command(action: string, args?: Record<string, any>): Promise<any>;
  createSession(options: Record<string, any>): Promise<any>;
  getStatus(): Promise<any>;
  getCookies(profileId: string): Promise<any>;
  loadCookiesFromFile(profileId: string, filePath: string): Promise<any>;
  health(): Promise<any>;
}
