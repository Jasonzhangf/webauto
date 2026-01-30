// 配置类型定义

export interface BrowserServiceConfig {
  host: string;
  port: number;
  backend: {
    baseUrl: string;
  };
  healthCheck: {
    autoCheck: boolean;
    strictMode: boolean;
    skipOnFirstSuccess: boolean;
    timeout: number;
  };
}

export interface PortsConfig {
  unified_api: number;
  browser_service: number;
  floating_bus?: number;
}

export interface EnvironmentConfig {
  NODE_ENV: string;
  WEBAUTO_DEBUG: string;
  WEBAUTO_LOG_LEVEL: string;
}

export interface EnvironmentsConfig {
  development: EnvironmentConfig;
  production: EnvironmentConfig;
}

export interface UIConfig {
  window: {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
  };
  theme: 'light' | 'dark' | 'auto';
  autoHide?: boolean;
}

export interface DesktopConsoleConfig {
  unifiedApiUrl: string;
  browserServiceUrl: string;
  searchGateUrl: string;
  downloadRoot: string;
  defaultEnv: 'debug' | 'prod';
  defaultKeyword: string;
  timeouts: {
    loginTimeoutSec: number;
    cmdTimeoutSec: number;
  };
}

export interface Config {
  browserService: BrowserServiceConfig;
  ports: PortsConfig;
  environments: EnvironmentsConfig;
  ui: UIConfig;
  /**
   * Electron 桌面管理台（apps/desktop-console）使用的 UI 配置
   */
  desktopConsole?: DesktopConsoleConfig;
}

export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export interface ConfigLoaderOptions {
  configPath?: string;
  /**
   * 是否缓存已加载的配置（默认 true）
   */
  cache?: boolean;
  /**
   * 是否启用 schema 验证（默认 true）
   */
  validate?: boolean;
  /**
   * @deprecated 请使用 `cache`
   */
  strictMode?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
  }>;
}
