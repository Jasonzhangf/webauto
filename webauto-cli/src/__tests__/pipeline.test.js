const Pipeline = require('../pipeline');
const Step = require('../step');

describe('Pipeline', () => {
  test('should execute steps in order', async () => {
    const pipeline = new Pipeline('test-pipeline');
    const executedSteps = [];
    
    const step1 = new Step('step1', async () => {
      executedSteps.push('step1');
    });
    
    const step2 = new Step('step2', async () => {
      executedSteps.push('step2');
    });
    
    pipeline.addStep(step1);
    pipeline.addStep(step2);
    
    await pipeline.execute();
    
    expect(executedSteps).toEqual(['step1', 'step2']);
  });
  
  test('should handle step errors', async () => {
    const pipeline = new Pipeline('test-pipeline');
    
    const step = new Step('error-step', async () => {
      throw new Error('Step error');
    });
    
    pipeline.addStep(step);
    
    await expect(pipeline.execute()).rejects.toThrow('Step error');
  });
});