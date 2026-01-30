// 配置模块使用示例

import { ConfigLoader, getConfig, getDefaultConfig, loadConfig, validateConfig } from '../src/index.js';
import type { Config, DeepPartial } from '../src/types.js';

async function example1() {
  // 加载配置
  const config = await loadConfig();
  
  // 访问配置
  console.log('Browser Service:', config.browserService.host + ':' + config.browserService.port);
  console.log('Unified API:', config.ports.unified_api);
  console.log('UI 主题:', config.ui.theme);
  
  // 获取缓存配置
  const cached = getConfig();
  if (cached) {
    console.log('缓存配置:', cached.ports);
  }
}

class BrowserService {
  private loader: ConfigLoader;
  
  constructor() {
    this.loader = new ConfigLoader();
  }
  
  async start() {
    const config = await this.loader.load();
    
    // 使用配置启动服务
    const host = config.browserService.host;
    const port = config.browserService.port;
    
    console.log(`启动 Browser Service: ${host}:${port}`);
    
    // 如果需要健康检查配置
    if (config.browserService.healthCheck.autoCheck) {
      console.log('启用健康检查');
    }
  }
  
  async updateConfig(newConfig: DeepPartial<Config>) {
    const current = await this.loader.load();
    const merged = this.loader.merge(current, newConfig);
    await this.loader.save(merged);
  }
}

async function initUI() {
  const config = await loadConfig();
  
  // 使用 UI 配置
  const width = config.ui.window.width;
  const height = config.ui.window.height;
  const theme = config.ui.theme;
  
  console.log(`初始化 UI: ${width}x${height}, 主题: ${theme}`);
  
  // 设置环境变量
  process.env.NODE_ENV = config.environments.development.NODE_ENV;
  process.env.WEBAUTO_DEBUG = config.environments.development.WEBAUTO_DEBUG;
}

async function validateConfigBeforeStart() {
  const result = await validateConfig();
  
  if (!result.valid) {
    console.error('配置验证失败:');
    result.errors?.forEach((err) => {
      console.error(`  ${err.path}: ${err.message}`);
    });
    process.exit(1);
  }
  
  console.log('配置验证通过');
}

function showDefaultConfig() {
  const defaultConfig = getDefaultConfig();
  console.log('默认配置:', JSON.stringify(defaultConfig, null, 2));
}

// 运行示例
async function main() {
  console.log('=== 配置模块使用示例 ===\n');
  
  await example1();
  
  const browserService = new BrowserService();
  await browserService.start();
  
  await initUI();
  
  await validateConfigBeforeStart();
  
  showDefaultConfig();
}

main().catch(console.error);
