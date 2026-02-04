/**
 * Workflow Block: WaitSearchPermitBlock
 *
 * 职责：
 * 1. 向 SearchGate 申请搜索许可
 * 2. 如果未获许可，自动等待并重试
 * 3. 只有拿到许可后才成功返回
 */
export interface WaitSearchPermitInput {
    sessionId: string;
    keyword?: string;
    gateUrl?: string;
    serviceUrl?: string;
    maxWaitMs?: number;
    skipIfAlreadyOnSearchResult?: boolean;
    dev?: boolean;
    devTag?: string;
}
export interface WaitSearchPermitOutput {
    success: boolean;
    granted: boolean;
    waitedMs: number;
    skipped?: boolean;
    reason?: string | null;
    retryAfterMs?: number | null;
    deny?: {
        code: string;
        message: string;
        retryAfterMs: number | null;
        details: any;
        suggestedActions: string[];
    } | null;
    error?: string;
}
export declare function execute(input: WaitSearchPermitInput): Promise<WaitSearchPermitOutput>;
//# sourceMappingURL=WaitSearchPermitBlock.d.ts.map