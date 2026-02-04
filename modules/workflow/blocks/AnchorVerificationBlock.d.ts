/**
 * Workflow Block: AnchorVerificationBlock
 *
 * 职责：
 * - 基于容器定义（container-library）验证指定容器锚点是否在视口内且可见
 * - 支持进入锚点 / 离开锚点两种语义（enter/exit）
 * - 避免在这里直接调用 containers:match，降低超时对主流程的影响
 */
export interface AnchorVerificationInput {
    sessionId: string;
    containerId: string;
    operation: 'enter' | 'exit';
    expectedVisible?: boolean;
    timeoutMs?: number;
    serviceUrl?: string;
}
export interface AnchorVerificationOutput {
    success: boolean;
    verified: boolean;
    containerFound: boolean;
    visible: boolean;
    rect?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    error?: string;
}
export declare function execute(input: AnchorVerificationInput): Promise<AnchorVerificationOutput>;
//# sourceMappingURL=AnchorVerificationBlock.d.ts.map