// 完全移除对rcc-underconstruction的依赖，使用纯JavaScript实现mock功能
class MockMCP {
  constructor() {
    // 创建模拟的UnderConstruction功能
    this.underConstruction = {
      delay: (ms) => new Promise(resolve => setTimeout(resolve, ms))
    };
  }

  async initialize() {
    console.log('Initializing Mock MCP...');
    // 模拟MCP初始化
    await this.underConstruction.delay(1000);
    console.log('Mock MCP initialized');
  }

  async handleRequest(request) {
    console.log(`Handling request: ${request.method} ${request.path}`);
    
    // 模拟处理请求
    await this.underConstruction.delay(500);
    
    // 返回模拟响应
    return {
      status: 200,
      data: {
        message: 'Mock response from MCP',
        request: request,
        timestamp: new Date().toISOString()
      }
    };
  }

  async startServer(port = 3000) {
    console.log(`Starting Mock MCP server on port ${port}...`);
    
    // 模拟服务器启动
    await this.underConstruction.delay(2000);
    
    console.log(`Mock MCP server started on port ${port}`);
    
    // 模拟服务器运行(有限循环)
    for (let i = 0; i < 5; i++) {
      await this.underConstruction.delay(5000);
      console.log('Mock MCP server is running...');
    }
    
    console.log('Mock MCP server stopped');
  }
  
  // 添加一个keepRunning方法用于实际运行
  async keepRunning(port = 3000) {
    console.log(`Starting Mock MCP server on port ${port}...`);
    
    // 模拟服务器启动
    await this.underConstruction.delay(2000);
    
    console.log(`Mock MCP server started on port ${port}`);
    
    // 模拟服务器运行(无限循环)
    let running = true;
    while (running) {
      await this.underConstruction.delay(5000);
      console.log('Mock MCP server is running...');
    }
    
    console.log('Mock MCP server stopped');
  }
}

module.exports = MockMCP;