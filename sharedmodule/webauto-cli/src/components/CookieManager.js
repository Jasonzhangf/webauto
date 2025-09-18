import React, { useState, useEffect } from 'react';

const CookieManager = () => {
  const [cookies, setCookies] = useState([]);
  const [newCookie, setNewCookie] = useState({
    url: '',
    name: '',
    value: ''
  });

  useEffect(() => {
    // 从存储中加载Cookie列表
    loadCookies();
  }, []);

  const loadCookies = () => {
    // 加载Cookie的逻辑
    console.log('Loading cookies...');
    // 模拟数据
    setCookies([
      { id: 1, url: 'https://example.com', name: 'session', value: 'abc123' },
      { id: 2, url: 'https://test.com', name: 'user', value: 'testuser' }
    ]);
  };

  const handleCookieChange = (e) => {
    const { name, value } = e.target;
    setNewCookie(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addCookie = () => {
    if (newCookie.url && newCookie.name && newCookie.value) {
      const cookie = {
        id: Date.now(), // 简单的ID生成
        ...newCookie
      };
      
      setCookies(prev => [...prev, cookie]);
      
      // 重置表单
      setNewCookie({
        url: '',
        name: '',
        value: ''
      });
    }
  };

  const removeCookie = (id) => {
    setCookies(prev => prev.filter(cookie => cookie.id !== id));
  };

  return (
    <div className="cookie-manager">
      <h2>Cookie管理</h2>
      <div className="cookie-form">
        <h3>添加Cookie</h3>
        <div>
          <label>URL:</label>
          <input
            type="text"
            name="url"
            value={newCookie.url}
            onChange={handleCookieChange}
            required
          />
        </div>
        <div>
          <label>名称:</label>
          <input
            type="text"
            name="name"
            value={newCookie.name}
            onChange={handleCookieChange}
            required
          />
        </div>
        <div>
          <label>值:</label>
          <input
            type="text"
            name="value"
            value={newCookie.value}
            onChange={handleCookieChange}
            required
          />
        </div>
        <button type="button" onClick={addCookie}>添加Cookie</button>
      </div>
      
      <h3>Cookie列表</h3>
      <ul className="cookie-list">
        {cookies.map(cookie => (
          <li key={cookie.id}>
            <span>{cookie.url} - {cookie.name}: {cookie.value}</span>
            <button type="button" onClick={() => removeCookie(cookie.id)}>删除</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CookieManager;