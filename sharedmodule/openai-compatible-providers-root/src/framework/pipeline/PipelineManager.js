/**
 * Pipeline Manager
 * 流水线管理器
 *
 * 负责创建和管理不同的流水线配置
 */

const Pipeline = require('./Pipeline');
const LLMSwitchNode = require('./LLMSwitchNode');
const WorkflowNode = require('./WorkflowNode');
const CompatibilityNode = require('./CompatibilityNode');
const ProviderNode = require('./ProviderNode');

class PipelineManager {
  constructor() {
    this.pipelines = new Map();
  }

  /**
   * 创建流水线
   * @param {Object} config 流水线配置
   * @returns {Pipeline} 流水线实例
   */
  createPipeline(config) {
    const pipeline = new Pipeline(config);

    // 根据输入协议类型组装pipeline
    if (config.inputProtocol === 'anthropic') {
      // 添加LLM Switch节点
      const llmSwitchNode = new LLMSwitchNode(config.llmSwitch || {});
      pipeline.addNode(llmSwitchNode);

      // 添加Workflow节点
      const workflowNode = new WorkflowNode(config.workflow || {});
      pipeline.addNode(workflowNode);
    }

    // 添加兼容性模块
    const compatibilityNode = new CompatibilityNode(config.compatibility);
    pipeline.addNode(compatibilityNode);

    // 添加Provider模块
    const providerNode = new ProviderNode(config.provider);
    pipeline.addNode(providerNode);

    // 验证流水线配置
    pipeline.validate();

    // 保存流水线
    this.pipelines.set(pipeline.name, pipeline);

    return pipeline;
  }

  /**
   * 获取流水线
   * @param {string} name 流水线名称
   * @returns {Pipeline} 流水线实例
   */
  getPipeline(name) {
    return this.pipelines.get(name);
  }

  /**
   * 执行流水线
   * @param {string} name 流水线名称
   * @param {Object} inputData 输入数据
   * @returns {Object} 处理结果
   */
  async executePipeline(name, inputData) {
    const pipeline = this.getPipeline(name);
    if (!pipeline) {
      throw new Error(`Pipeline '${name}' not found`);
    }

    return await pipeline.execute(inputData);
  }

  /**
   * 获取所有流水线信息
   * @returns {Array} 流水线信息数组
   */
  getAllPipelineInfo() {
    const infos = [];
    for (const [name, pipeline] of this.pipelines) {
      infos.push({
        name,
        ...pipeline.getPipelineInfo()
      });
    }
    return infos;
  }

  /**
   * 删除流水线
   * @param {string} name 流水线名称
   * @returns {boolean} 是否删除成功
   */
  removePipeline(name) {
    return this.pipelines.delete(name);
  }
}

module.exports = PipelineManager;