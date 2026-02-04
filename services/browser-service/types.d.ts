declare module '../../libs/browser/cookie-manager.js' {
  export class CookieManager {
    constructor(profileDir?: string);
    injectCookiesForUrl(context: any, url: string, profileId: string): Promise<{ success: boolean; count?: number }>;
    saveCookiesForUrl(context: any, url: string, profileId: string): Promise<{ success: boolean; path?: string; count?: number }>;
  }
}

declare module '../../libs/browser/fingerprint-manager.js' {
  export function generateFingerprint(profileId?: string, options?: any): any;
  export function applyFingerprint(context: any, fingerprint: any): Promise<void>;
  export function loadFingerprint(path: string): Promise<any | null>;
  export function saveFingerprint(path: string, fingerprint: any): Promise<boolean>;
  export function getFingerprintPath(profileId: string): string;
  export function generateAndSaveFingerprint(profileId: string, options?: any): Promise<{ fingerprint: any; path: string }>;
  export function loadOrGenerateFingerprint(profileId: string, options?: any): Promise<any>;
  export const FINGERPRINT_DIR: string;
}

declare module '../../libs/browser/fingerprint-manager.js?module' {
  export * from '../../libs/browser/fingerprint-manager.js';
}

declare module '../../libs/browser/engine-manager.js' {
  export class EngineManager {
    constructor(engine?: 'camoufox');
    static resolveEngineType(raw?: string | null): 'camoufox';
    static getCamoufoxPath(): Promise<string | null>;
    launchPersistentContext(options: any): Promise<any>;
  }
  export default EngineManager;
}

declare module '../../libs/browser/engine-manager.js?module' {
  import EngineManager from '../../libs/browser/engine-manager.js';
  export default EngineManager;
}
