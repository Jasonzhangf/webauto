/**
 * Workflow Block: ErrorRecoveryBlock
 *
 * 职责：
 * - 提供阶段错误后的恢复策略
 * - 统一恢复到安全起点（搜索页或主页）
 * - 验证恢复是否成功（锚点回环）
 * - 支持ESC恢复模式（用于Phase3/4详情页恢复）
 * - 支持多种恢复路径（home/search/detail）
 */
export interface ErrorRecoveryInput {
    sessionId: string;
    fromStage: 'search' | 'detail' | 'home';
    targetStage: 'search' | 'home';
    serviceUrl?: string;
    maxRetries?: number;
    recoveryMode?: 'esc' | 'navigate';
}
export interface ErrorRecoveryOutput {
    success: boolean;
    recovered: boolean;
    finalStage: 'search' | 'home' | 'unknown';
    currentUrl?: string;
    error?: string;
    method?: string;
}
export declare function execute(input: ErrorRecoveryInput): Promise<ErrorRecoveryOutput>;
//# sourceMappingURL=ErrorRecoveryBlock.d.ts.map