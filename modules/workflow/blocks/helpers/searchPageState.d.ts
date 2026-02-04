/**
 * SearchPageState helper
 *
 * 处理搜索页面状态验证和 URL 关键词校验
 */
export interface PageStateConfig {
    profile: string;
    controllerUrl: string;
}
export interface EnsureHomePageResult {
    success: boolean;
    url: string;
    onSearchPage: boolean;
    hasDetailOverlay?: boolean;
    onCaptchaPage?: boolean;
}
export interface ProbeSearchPageStateResult {
    hasItems: boolean;
    hasNoResultText: boolean;
}
export declare function urlKeywordEquals(url: string, keyword: string): boolean;
export declare function getCurrentUrl(config: PageStateConfig): Promise<string>;
export declare function ensureHomePage(config: PageStateConfig): Promise<EnsureHomePageResult>;
export declare function probeSearchPageState(config: PageStateConfig): Promise<ProbeSearchPageStateResult>;
//# sourceMappingURL=searchPageState.d.ts.map