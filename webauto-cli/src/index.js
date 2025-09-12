const { BaseModule } = require('rcc-basemodule');
const { ErrorHandlingCenter } = require('rcc-errorhandling');
const Pipeline = require('./pipeline');
const Step = require('./step');
const Browser = require('./browser');
const CookieManager = require('./cookieManager');
const RuleEngine = require('./ruleEngine');
const AIExtractor = require('./aiExtractor');
const RuleApplier = require('./ruleApplier');
const MCPManager = require('./mcp');

class WebAutoCLI extends BaseModule {
  constructor() {
    super();
    this.errorHandler = new ErrorHandlingCenter({
      id: 'webauto-cli',
      name: 'WebAuto CLI Error Handler'
    });
    this.browser = new Browser();
    this.cookieManager = new CookieManager();
    this.ruleEngine = new RuleEngine();
    // Initialize AI extractor if API key is provided
    this.aiExtractor = process.env.OPENAI_API_KEY ? new AIExtractor(process.env.OPENAI_API_KEY) : null;
    this.ruleApplier = new RuleApplier(this.ruleEngine, this.browser);
    this.mcpManager = new MCPManager();
  }

  async start() {
    console.log('Web Automation CLI started');
    
    // Initialize MCP
    await this.mcpManager.initialize();
    
    // Example pipeline
    const pipeline = new Pipeline('Example Pipeline');
    
    pipeline.addStep(new Step('Example Step 1', async () => {
      console.log('Executing example action 1');
    }));
    
    pipeline.addStep(new Step('Example Step 2', async () => {
      console.log('Executing example action 2');
    }));
    
    try {
      await pipeline.execute();
    } catch (error) {
      this.errorHandler.handleError({
        error: error,
        source: 'WebAutoCLI.start',
        severity: 'error'
      });
    }
  }
}

// Run if called directly
if (require.main === module) {
  const cli = new WebAutoCLI();
  cli.start();
}

module.exports = WebAutoCLI;