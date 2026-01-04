/**
 * 消息 RPC 客户端
 * 封装 Request-Response 模式的消息通信
 */
export class MessageRpcClient {
    messageBus;
    pendingRequests = new Map();
    constructor(messageBus) {
        this.messageBus = messageBus;
    }
    /**
     * 初始化：订阅响应通道
     * @param responsePattern 响应消息的通配符，例如 'RES_BROWSER_*'
     */
    init(responsePattern = 'RES_*') {
        this.messageBus.subscribe(responsePattern, this.handleResponse.bind(this));
    }
    /**
     * 发送命令并等待响应
     * @param commandType 命令消息类型
     * @param payload 命令载荷
     * @param options 选项
     */
    async call(commandType, payload = {}, options = {}) {
        const timeout = options.timeout || 5000;
        // 使用随机 ID 作为关联 ID，Payload 中必须包含 requestId
        const requestId = payload.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // 确保 payload 中有 requestId
        const requestPayload = { ...payload, requestId };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(`RPC timeout for command ${commandType} (requestId: ${requestId})`));
                }
            }, timeout);
            this.pendingRequests.set(requestId, { resolve, reject, timer });
            this.messageBus.publish(commandType, requestPayload, { component: 'MessageRpcClient' })
                .catch(err => {
                clearTimeout(timer);
                this.pendingRequests.delete(requestId);
                reject(err);
            });
        });
    }
    handleResponse(message) {
        const requestId = message.payload?.requestId;
        if (!requestId)
            return;
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(requestId);
            // 假设响应 Payload 结构为 { requestId, success, data, error }
            // 或者我们将整个 Payload 作为 data，如果它不符合标准结构
            let response;
            if (typeof message.payload.success === 'boolean') {
                response = message.payload;
            }
            else {
                // 兼容非标准响应，默认为成功
                response = {
                    success: true,
                    data: message.payload
                };
            }
            pending.resolve(response);
        }
    }
}
