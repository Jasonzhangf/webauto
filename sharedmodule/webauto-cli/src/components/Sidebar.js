import React from 'react';

const Sidebar = () => {
  return (
    <nav className="sidebar">
      <ul>
        <li><a href="#/pipelines">流水线管理</a></li>
        <li><a href="#/rules">规则管理</a></li>
        <li><a href="#/settings">设置</a></li>
      </ul>
    </nav>
  );
};

export default Sidebar;