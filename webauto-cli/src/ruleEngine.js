class RuleEngine {
  constructor() {
    this.rules = new Map(); // Store rules by URL pattern
  }

  // Add a rule for a specific URL pattern
  addRule(urlPattern, rule) {
    if (!this.rules.has(urlPattern)) {
      this.rules.set(urlPattern, []);
    }
    this.rules.get(urlPattern).push(rule);
  }

  // Get rules for a specific URL
  getRules(url) {
    const matchingRules = [];
    
    for (const [pattern, rules] of this.rules.entries()) {
      // Simple pattern matching (can be enhanced with regex or more sophisticated matching)
      if (url.includes(pattern) || pattern === '*') {
        matchingRules.push(...rules);
      }
    }
    
    return matchingRules;
  }

  // Save rules to storage (simplified in-memory version)
  saveRules() {
    // In a real implementation, this would save to a file or database
    console.log('Rules saved to storage');
  }

  // Load rules from storage (simplified in-memory version)
  loadRules() {
    // In a real implementation, this would load from a file or database
    console.log('Rules loaded from storage');
  }
}

module.exports = RuleEngine;