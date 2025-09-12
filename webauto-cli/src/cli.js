#!/usr/bin/env node

const { BaseModule } = require('rcc-basemodule');
const { ErrorHandler } = require('rcc-errorhandling');
const Pipeline = require('./pipeline');
const Browser = require('./browser');
const CookieManager = require('./cookieManager');
const RuleEngine = require('./ruleEngine');
const RuleApplier = require('./ruleApplier');

class WebAutoCLI extends BaseModule {
  constructor() {
    super();
    this.errorHandler = new ErrorHandler();
    this.browser = new Browser();
    this.cookieManager = new CookieManager();
    this.ruleEngine = new RuleEngine();
    this.ruleApplier = new RuleApplier(this.ruleEngine, this.browser);
  }

  async executePipeline(pipelineName) {
    console.log(`Executing pipeline: ${pipelineName}`);
    
    // 这里应该从存储中加载流水线配置
    // 为了简化，我们创建一个示例流水线
    
    const pipeline = new Pipeline(pipelineName);
    
    // 添加示例步骤
    // 在实际实现中，这些步骤应该从配置中加载
    
    try {
      await pipeline.execute();
      console.log(`Pipeline ${pipelineName} completed successfully`);
    } catch (error) {
      console.error(`Error executing pipeline ${pipelineName}: ${error.message}`);
      this.errorHandler.handle(error);
    } finally {
      // 关闭浏览器
      await this.browser.close();
    }
  }

  async applyRules(url) {
    console.log(`Applying rules to: ${url}`);
    
    try {
      await this.ruleApplier.applyRules(url);
      console.log(`Rules applied successfully to ${url}`);
    } catch (error) {
      console.error(`Error applying rules to ${url}: ${error.message}`);
      this.errorHandler.handle(error);
    }
  }
}

// CLI命令行接口
const cli = new WebAutoCLI();

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'run-pipeline':
    const pipelineName = args[1];
    if (!pipelineName) {
      console.error('Pipeline name is required');
      process.exit(1);
    }
    cli.executePipeline(pipelineName);
    break;
    
  case 'apply-rules':
    const url = args[1];
    if (!url) {
      console.error('URL is required');
      process.exit(1);
    }
    cli.applyRules(url);
    break;
    
  case 'mcp':
    // 启动MCP服务器
    require('./mcp/stdio-transport');
    break;
    
  default:
    console.log('Usage:');
    console.log('  webauto run-pipeline <pipeline-name>');
    console.log('  webauto apply-rules <url>');
    console.log('  webauto mcp');
    process.exit(1);
}

module.exports = WebAutoCLI;