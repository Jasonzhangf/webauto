/**
 * 容器锚点验证辅助函数（不依赖 containers:match）
 * 直接从容器定义 JSON 读取 selector，然后用 browser:execute 高亮 + Rect 回环
 *
 * 注意：这里不使用 dist 里的 ContainerDefinitionLoader（V2 结构只保留了 classes，丢失 css），
 * 而是直接读取 container-library 下的原始 JSON，保证 selector.css 可用。
 */
export interface ContainerDefinition {
    id: string;
    selectors?: Array<{
        css?: string;
        variant?: string;
        score?: number;
    }>;
    extractors?: Record<string, {
        selectors?: string[];
        attr?: string;
    }>;
}
export interface AnchorRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface AnchorVerifyResult {
    found: boolean;
    highlighted: boolean;
    rect?: AnchorRect;
    selector?: string;
    error?: string;
}
export declare function getPrimarySelectorByContainerId(containerId: string): Promise<string | null>;
export declare function getContainerExtractorsById(containerId: string): Promise<ContainerDefinition['extractors'] | null>;
export declare function verifyAnchorByContainerId(containerId: string, sessionId: string, serviceUrl?: string, highlightStyle?: string, highlightDuration?: number): Promise<AnchorVerifyResult>;
//# sourceMappingURL=containerAnchors.d.ts.map