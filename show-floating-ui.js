// 强制以非headless方式启动浮窗
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLOATING_APP_DIR = path.join(__dirname, 'apps', 'floating-panel');

console.log('🎯 启动可视化浮窗控制台...');

// 设置环境变量为非headless模式
const env = {
  ...process.env,
  WEBAUTO_FLOATING_HEADLESS: '0',  // 关键：关闭headless
  WEBAUTO_FLOATING_WS_URL: 'ws://127.0.0.1:8765',
  WEBAUTO_FLOATING_BUS_PORT: '8790',
};

// 启动electron浮窗
const floating = spawn('npm', ['run', 'dev'], {
  cwd: FLOATING_APP_DIR,
  stdio: 'inherit',
  env
});

floating.on('exit', (code) => {
  console.log(`浮窗控制台退出: ${code}`);
  process.exit(code);
});

// 捕获退出信号
process.on('SIGINT', () => {
  console.log('正在关闭浮窗...');
  floating.kill('SIGINT');
});
