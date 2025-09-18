/**
 * Simple Test Scheduler for Virtual Model Mapping
 * 虚拟模型映射的简单测试调度器
 */
export declare class TestScheduler {
    private name;
    private requestCount;
    private virtualModelStats;
    constructor(name?: string);
    /**
     * 处理虚拟模型请求 - 打印详细映射信息
     */
    processVirtualModelRequest(request: any, virtualModel: any): Promise<any>;
    /**
     * 获取调度器统计信息
     */
    getStats(): {
        name: string;
        totalRequests: number;
        virtualModelStats: {
            [k: string]: number;
        };
        uniqueVirtualModels: number;
    };
    /**
     * 打印统计信息
     */
    printStats(): void;
    /**
     * 重置统计信息
     */
    reset(): void;
}
export default TestScheduler;
//# sourceMappingURL=TestScheduler.d.ts.map