/**
 * Simple Test Scheduler for Virtual Model Mapping
 * 虚拟模型映射的简单测试调度器
 */

export class TestScheduler {
  private name: string;
  private requestCount: number = 0;
  private virtualModelStats: Map<string, number> = new Map();

  constructor(name: string = 'TestScheduler') {
    this.name = name;
    console.log(`🧪 [${this.name}] Test Scheduler initialized`);
  }

  /**
   * 处理虚拟模型请求 - 打印详细映射信息
   */
  public async processVirtualModelRequest(request: any, virtualModel: any): Promise<any> {
    this.requestCount++;
    const requestId = request.id || `req-${this.requestCount}`;
    const timestamp = new Date().toISOString();

    // 统计虚拟模型请求次数
    const currentCount = this.virtualModelStats.get(virtualModel.id) || 0;
    this.virtualModelStats.set(virtualModel.id, currentCount + 1);

    // 打印详细的请求映射信息
    console.log('\n🔍 === VIRTUAL MODEL REQUEST MAPPING ===');
    console.log(`📋 [${this.name}] Request Details:`);
    console.log(`   🔑 Request ID: ${requestId}`);
    console.log(`   🕐 Timestamp: ${timestamp}`);
    console.log(`   🎯 Virtual Model: ${virtualModel.id}`);
    console.log(`   🏭 Provider: ${virtualModel.provider}`);
    console.log(`   🤖 Model: ${virtualModel.model}`);
    console.log(`   📊 Request Count for this VM: ${currentCount + 1}`);
    console.log(`   🌐 Total Requests Processed: ${this.requestCount}`);

    // 打印请求内容分析
    console.log(`\n📝 [${this.name}] Request Analysis:`);
    if (request.messages && request.messages.length > 0) {
      const lastMessage = request.messages[request.messages.length - 1];
      console.log(`   💬 Last Message: ${lastMessage.content?.substring(0, 50)}...`);
      console.log(`   👤 Message Role: ${lastMessage.role}`);
      console.log(`   📨 Total Messages: ${request.messages.length}`);
    }

    if (request.max_tokens) {
      console.log(`   🎛️  Max Tokens: ${request.max_tokens}`);
    }

    // 打印映射关系验证
    console.log(`\n🔗 [${this.name}] Mapping Validation:`);
    console.log(`   ✅ Virtual Model → Provider: ${virtualModel.id} → ${virtualModel.provider}`);
    console.log(`   ✅ Provider → Model: ${virtualModel.provider} → ${virtualModel.model}`);
    console.log(`   ✅ Capabilities: ${virtualModel.capabilities?.join(', ') || 'chat'}`);

    // 检查配置的完整性
    const hasValidConfig = virtualModel.provider && virtualModel.model;
    console.log(`   ${hasValidConfig ? '✅' : '❌'} Configuration Complete: ${hasValidConfig}`);

    // 打印调度决策
    console.log(`\n🎯 [${this.name}] Scheduling Decision:`);
    console.log(`   📍 Strategy: direct-mapping (no actual scheduling)`);
    console.log(`   🎪 Target: ${virtualModel.provider}/${virtualModel.model}`);
    console.log(`   🔄 Fallback Mode: enabled`);

    // 模拟处理时间
    const processingTime = Math.random() * 100 + 50; // 50-150ms
    console.log(`   ⏱️  Simulated Processing Time: ${processingTime.toFixed(2)}ms`);

    // 返回测试响应
    const response = {
      id: requestId,
      type: 'test-scheduler-response',
      timestamp,
      processingTime,
      virtualModel: {
        id: virtualModel.id,
        provider: virtualModel.provider,
        model: virtualModel.model
      },
      request: {
        method: request.method || 'POST',
        path: request.path || '/v1/messages',
        model: request.model,
        max_tokens: request.max_tokens
      },
      scheduling: {
        scheduler: this.name,
        strategy: 'direct-mapping',
        decision: 'forward-to-provider',
        fallback: false
      },
      stats: {
        totalRequests: this.requestCount,
        virtualModelRequests: currentCount + 1,
        avgProcessingTime: processingTime
      },
      message: `Test scheduler processed request for virtual model "${virtualModel.id}" through provider "${virtualModel.provider}"`
    };

    console.log(`\n✅ [${this.name}] Request processed successfully`);
    console.log(`📤 [${this.name}] Response: ${response.message}`);
    console.log('🔍 === END MAPPING ANALYSIS ===\n');

    return response;
  }

  /**
   * 获取调度器统计信息
   */
  public getStats() {
    return {
      name: this.name,
      totalRequests: this.requestCount,
      virtualModelStats: Object.fromEntries(this.virtualModelStats),
      uniqueVirtualModels: this.virtualModelStats.size
    };
  }

  /**
   * 打印统计信息
   */
  public printStats() {
    console.log('\n📊 === TEST SCHEDULER STATISTICS ===');
    console.log(`🏷️  Scheduler Name: ${this.name}`);
    console.log(`📈 Total Requests: ${this.requestCount}`);
    console.log(`🎯 Unique Virtual Models: ${this.virtualModelStats.size}`);

    console.log('\n📋 Virtual Model Distribution:');
    for (const [vmId, count] of this.virtualModelStats.entries()) {
      console.log(`   ${vmId}: ${count} requests (${((count / this.requestCount) * 100).toFixed(1)}%)`);
    }

    console.log('📊 === END STATISTICS ===\n');
  }

  /**
   * 重置统计信息
   */
  public reset() {
    this.requestCount = 0;
    this.virtualModelStats.clear();
    console.log(`🔄 [${this.name}] Test scheduler stats reset`);
  }
}

export default TestScheduler;