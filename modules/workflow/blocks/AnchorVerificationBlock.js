/**
 * Workflow Block: AnchorVerificationBlock
 *
 * 职责：
 * - 基于容器定义（container-library）验证指定容器锚点是否在视口内且可见
 * - 支持进入锚点 / 离开锚点两种语义（enter/exit）
 * - 避免在这里直接调用 containers:match，降低超时对主流程的影响
 */
export async function execute(input) {
    const { sessionId, containerId, operation, expectedVisible = operation === 'enter', 
    // timeoutMs 目前只用于 browser:execute 的防御性超时
    timeoutMs = 10000, serviceUrl = 'http://127.0.0.1:7701' } = input;
    try {
        console.log(`[AnchorVerification] ${operation} anchor: ${containerId}`);
        // 通过 container-library 定义获取 selector，并在页面内高亮 + 读取 Rect。
        // 注意：这里不再调用 containers:match，避免复用阶段性 P0 问题。
        const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');
        const anchor = await verifyAnchorByContainerId(containerId, sessionId, serviceUrl, '3px solid #ff4444', 2000);
        if (!anchor.found) {
            return {
                success: false,
                verified: false,
                containerFound: false,
                visible: false,
                error: anchor.error || `容器未找到: ${containerId}`
            };
        }
        const rect = anchor.rect;
        if (!rect) {
            return {
                success: false,
                verified: false,
                containerFound: true,
                visible: false,
                error: '未获取到锚点 Rect'
            };
        }
        // 视口内判定：在这里不直接依赖 window.innerHeight，
        // 仅要求宽高 > 0，由调用方结合 Rect 再做更严格判断。
        const visible = rect.width > 0 && rect.height > 0;
        // enter: 期望可见；exit: 期望不可见/不可命中
        const verified = visible === !!expectedVisible;
        if (!verified) {
            return {
                success: false,
                verified: false,
                containerFound: true,
                visible,
                rect,
                error: `锚点验证失败: 期望${expectedVisible ? '可见' : '不可见'}, 实际${visible ? '可见' : '不可见'}`
            };
        }
        return {
            success: true,
            verified: true,
            containerFound: true,
            visible,
            rect
        };
    }
    catch (err) {
        return {
            success: false,
            verified: false,
            containerFound: false,
            visible: false,
            error: `锚点验证异常: ${err.message}`
        };
    }
}
//# sourceMappingURL=AnchorVerificationBlock.js.map