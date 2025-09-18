const RuleEngine = require('../ruleEngine');

describe('RuleEngine', () => {
  test('should add and retrieve rules', () => {
    const ruleEngine = new RuleEngine();
    
    const rule = {
      name: 'test-rule',
      action: 'click',
      selector: '#test-button'
    };
    
    ruleEngine.addRule('example.com', rule);
    const rules = ruleEngine.getRules('https://example.com/page');
    
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual(rule);
  });
  
  test('should return empty array for no matching rules', () => {
    const ruleEngine = new RuleEngine();
    const rules = ruleEngine.getRules('https://example.com/page');
    
    expect(rules).toHaveLength(0);
  });
});