/**
 * Web Automation Tools Package
 * 自动发现和注册的MCP工具
 */

// 网页截图工具
const screenshotTool = {
  name: 'takeScreenshot',
  description: 'Take a screenshot of the current webpage',
  inputSchema: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector of element to screenshot (optional, defaults to full page)'
      },
      filename: {
        type: 'string',
        description: 'Filename for the screenshot (optional)'
      }
    }
  }
};

// 网页导航工具
const navigationTool = {
  name: 'navigateTo',
  description: 'Navigate to a specified URL',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to navigate to'
      },
      timeout: {
        type: 'number',
        description: 'Navigation timeout in milliseconds',
        default: 30000
      }
    },
    required: ['url']
  }
};

// 元素查找工具
const findElementTool = {
  name: 'findElement',
  description: 'Find an element on the page by CSS selector',
  inputSchema: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector to search for'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds',
        default: 5000
      }
    },
    required: ['selector']
  }
};

// 表单填写工具
const fillFormTool = {
  name: 'fillForm',
  description: 'Fill form fields with provided data',
  inputSchema: {
    type: 'object',
    properties: {
      formData: {
        type: 'object',
        description: 'Object mapping field names/selectors to values',
        additionalProperties: true
      },
      submit: {
        type: 'boolean',
        description: 'Whether to submit the form after filling',
        default: false
      }
    },
    required: ['formData']
  }
};

// 导出多个工具
module.exports.mcpTools = [
  screenshotTool,
  navigationTool,
  findElementTool,
  fillFormTool
];

// 也可以导出单个工具作为默认导出
module.exports.mcpTool = screenshotTool;