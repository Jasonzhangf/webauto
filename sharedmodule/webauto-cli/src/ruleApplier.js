class RuleApplier {
  constructor(ruleEngine, browser) {
    this.ruleEngine = ruleEngine;
    this.browser = browser;
  }

  async applyRules(url) {
    // Get rules for this URL
    const rules = this.ruleEngine.getRules(url);
    
    if (rules.length === 0) {
      console.log(`No rules found for ${url}`);
      return;
    }
    
    console.log(`Applying ${rules.length} rules for ${url}`);
    
    // Launch browser if not already launched
    const browserInstance = await this.browser.launch();
    const page = await browserInstance.newPage();
    
    try {
      // Navigate to the URL
      await page.goto(url);
      
      // Apply each rule
      for (const rule of rules) {
        await this.applyRule(page, rule);
      }
    } finally {
      // Close the page but keep the browser open
      await page.close();
    }
  }

  async applyRule(page, rule) {
    try {
      // Rule application logic
      console.log(`Applying rule: ${rule.name}`);
      
      // Example rule application (simplified)
      if (rule.action === 'click') {
        await page.click(rule.selector);
      } else if (rule.action === 'type') {
        await page.type(rule.selector, rule.value);
      } else if (rule.action === 'extract') {
        const extracted = await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent : null;
        }, rule.selector);
        
        console.log(`Extracted value: ${extracted}`);
        // Store extracted value for later use
        rule.extractedValue = extracted;
      }
    } catch (error) {
      console.error(`Error applying rule ${rule.name}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = RuleApplier;