const CookieManager = require('./cookieManager');
const RuleEngine = require('./ruleEngine');

class Pipeline {
  constructor(name) {
    this.name = name;
    this.steps = [];
    this.cookieManager = new CookieManager();
    this.ruleEngine = new RuleEngine();
  }

  addStep(step) {
    this.steps.push(step);
  }

  async execute() {
    console.log(`Executing pipeline: ${this.name}`);
    
    for (const step of this.steps) {
      try {
        await step.run();
      } catch (error) {
        console.error(`Error in step: ${error.message}`);
        throw error;
      }
    }
    
    console.log(`Pipeline ${this.name} completed successfully`);
  }
}

module.exports = Pipeline;