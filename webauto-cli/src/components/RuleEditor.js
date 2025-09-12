import React, { useState } from 'react';

const RuleEditor = () => {
  const [rule, setRule] = useState({
    name: '',
    urlPattern: '',
    selector: '',
    action: 'click',
    value: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setRule(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // 保存规则的逻辑
    console.log('Saving rule:', rule);
  };

  return (
    <div className="rule-editor">
      <h2>规则编辑器</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>规则名称:</label>
          <input
            type="text"
            name="name"
            value={rule.name}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label>URL模式:</label>
          <input
            type="text"
            name="urlPattern"
            value={rule.urlPattern}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label>选择器:</label>
          <input
            type="text"
            name="selector"
            value={rule.selector}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label>动作:</label>
          <select
            name="action"
            value={rule.action}
            onChange={handleChange}
          >
            <option value="click">点击</option>
            <option value="type">输入</option>
            <option value="extract">提取</option>
          </select>
        </div>
        {rule.action === 'type' && (
          <div>
            <label>输入值:</label>
            <input
              type="text"
              name="value"
              value={rule.value}
              onChange={handleChange}
            />
          </div>
        )}
        <button type="submit">保存规则</button>
      </form>
    </div>
  );
};

export default RuleEditor;