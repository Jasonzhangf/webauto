/**
 * Workflow Block: DetectPageStateBlock
 *
 * 基于 URL + 容器匹配检测当前页面阶段：
 * - xiaohongshu: login / detail / search / home / unknown
 * - weibo: login / detail / search / home / unknown
 *
 * 用于在进入各 Phase 前做“入口锚点”判定。
 */
export type PageStage = 'login' | 'detail' | 'search' | 'home' | 'unknown';
export interface DetectPageStateInput {
    sessionId: string;
    platform?: 'xiaohongshu' | 'weibo' | 'auto';
    serviceUrl?: string;
}
export interface DetectPageStateOutput {
    success: boolean;
    sessionId: string;
    platform: 'xiaohongshu' | 'weibo' | 'unknown';
    url: string;
    stage: PageStage;
    pageName?: string;
    rootId?: string | null;
    matchIds?: string[];
    /** DOM side signals (optional, only when available) */
    dom?: {
        hasDetailMask?: boolean;
        hasSearchInput?: boolean;
        readyState?: string;
        title?: string;
    };
    error?: string;
}
export declare function execute(input: DetectPageStateInput): Promise<DetectPageStateOutput>;
//# sourceMappingURL=DetectPageStateBlock.d.ts.map