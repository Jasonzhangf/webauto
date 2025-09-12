class Step {
  constructor(name, action, rules = []) {
    this.name = name;
    this.action = action;
    this.rules = rules; // Rules specific to this step
  }

  async run() {
    console.log(`Executing step: ${this.name}`);
    
    // Apply rules if any
    if (this.rules.length > 0) {
      console.log(`Applying ${this.rules.length} rules for this step`);
      // Rule application logic would go here
    }
    
    return await this.action();
  }
}

module.exports = Step;