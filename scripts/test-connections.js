import { spawn } from 'child_process';

const LOG_FILE = '/tmp/floating-ui.log';
const UI_LOG = '/tmp/floating-renderer.log';

// Clear logs
const fs = await import('fs');
fs.writeFileSync(LOG_FILE, '');
fs.writeFileSync(UI_LOG, '');

// Start UI (no args for defaults)
const ui = spawn('node', ['apps/floating-panel/scripts/start-headful.mjs'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: false
});

// Capture stdout (renderer logs)
const rendererLogs = [];
ui.stdout.on('data', (data) => {
  const str = data.toString();
  rendererLogs.push(str);
  process.stdout.write(str); // Echo to console
});

ui.on('close', async () => {
  console.log('\n=== 测试完成，分析日志 ===\n');

  const combined = rendererLogs.join('');
  
  // Check for key indicators
  const issues = [];
  
  // 1. Check if preload API loaded
  if (combined.includes('window.api missing')) {
    issues.push('❌ Preload API 未加载');
  } else if (combined.includes('preload API available')) {
    issues.push('✓ Preload API 已加载');
  }
  
  // 2. Check for container matching
  if (combined.includes('containers:matched')) {
    issues.push('✓ 容器匹配事件触发');
  }
  
  // 3. Check for "Cannot draw" errors
  const cannotDraw = (combined.match(/Cannot draw/g) || []).length;
  if (cannotDraw > 0) {
    issues.push(`❌ 发现 ${cannotDraw} 个“Cannot draw”错误`);
  } else {
    issues.push('✓ 没有“Cannot draw”错误');
  }
  
  // 4. Check for connection success
  if (combined.includes('Drew connection')) {
    issues.push('✓ 发现有连线绘制日志');
  } else {
    issues.push('⚠️  未发现连线绘制日志');
  }

  console.log('\n分析结果:');
  issues.forEach(msg => console.log(`  ${msg}`));
  
  // Summary
  if (issues.some(m => m.startsWith('❌'))) {
    process.exit(1);
  }
});
