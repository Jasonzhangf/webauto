declare module '../../libs/browser/cookie-manager.js' {
  export class CookieManager {
    constructor(profileDir?: string);
    injectCookiesForUrl(context: any, url: string, profileId: string): Promise<{ success: boolean; count?: number }>;
    saveCookiesForUrl(context: any, url: string, profileId: string): Promise<{ success: boolean; path?: string; count?: number }>;
  }
}
