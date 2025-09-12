import React, { useState } from 'react';

const PipelineConfig = () => {
  const [pipeline, setPipeline] = useState({
    name: '',
    description: '',
    steps: []
  });

  const [newStep, setNewStep] = useState({
    name: '',
    url: '',
    rules: []
  });

  const handlePipelineChange = (e) => {
    const { name, value } = e.target;
    setPipeline(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleStepChange = (e) => {
    const { name, value } = e.target;
    setNewStep(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addStep = () => {
    if (newStep.name && newStep.url) {
      setPipeline(prev => ({
        ...prev,
        steps: [...prev.steps, { ...newStep }]
      }));
      
      // Reset new step form
      setNewStep({
        name: '',
        url: '',
        rules: []
      });
    }
  };

  const removeStep = (index) => {
    setPipeline(prev => {
      const steps = [...prev.steps];
      steps.splice(index, 1);
      return { ...prev, steps };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // 保存流水线的逻辑
    console.log('Saving pipeline:', pipeline);
  };

  return (
    <div className="pipeline-config">
      <h2>流水线配置</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>流水线名称:</label>
          <input
            type="text"
            name="name"
            value={pipeline.name}
            onChange={handlePipelineChange}
            required
          />
        </div>
        <div>
          <label>描述:</label>
          <textarea
            name="description"
            value={pipeline.description}
            onChange={handlePipelineChange}
          />
        </div>
        
        <h3>步骤配置</h3>
        <div className="step-form">
          <div>
            <label>步骤名称:</label>
            <input
              type="text"
              name="name"
              value={newStep.name}
              onChange={handleStepChange}
              required
            />
          </div>
          <div>
            <label>URL:</label>
            <input
              type="text"
              name="url"
              value={newStep.url}
              onChange={handleStepChange}
              required
            />
          </div>
          <button type="button" onClick={addStep}>添加步骤</button>
        </div>
        
        <h3>步骤列表</h3>
        <ul className="step-list">
          {pipeline.steps.map((step, index) => (
            <li key={index}>
              <span>{step.name} - {step.url}</span>
              <button type="button" onClick={() => removeStep(index)}>删除</button>
            </li>
          ))}
        </ul>
        
        <button type="submit">保存流水线</button>
      </form>
    </div>
  );
};

export default PipelineConfig;