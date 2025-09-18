const Logger = require('./logger');

class Debugger {
  constructor() {
    this.logger = new Logger('./logs/debug.log');
    this.isDebugEnabled = process.env.DEBUG === 'true';
  }

  async debug(message) {
    if (this.isDebugEnabled) {
      await this.logger.debug(`[DEBUGGER] ${message}`);
    }
  }

  async logStep(stepName, details = {}) {
    if (this.isDebugEnabled) {
      const detailsStr = JSON.stringify(details);
      await this.logger.debug(`[STEP] ${stepName} - Details: ${detailsStr}`);
    }
  }

  async logRuleApplication(ruleName, result) {
    if (this.isDebugEnabled) {
      await this.logger.debug(`[RULE] ${ruleName} applied - Result: ${JSON.stringify(result)}`);
    }
  }

  async logError(error, context = {}) {
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      context: JSON.stringify(context)
    };
    
    await this.logger.error(`[DEBUGGER] Error occurred - Details: ${JSON.stringify(errorDetails)}`);
  }
}

module.exports = Debugger;