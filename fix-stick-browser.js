import fs from 'fs';

const mainFile = 'apps/floating-panel/electron/main.js';
let content = fs.readFileSync(mainFile, 'utf8');

// 替换handleStickBrowser函数，只缩小不移动
const newHandleStickBrowser = `
async function handleStickBrowser(payload = {}) {
  // 新模式：只缩小浮窗，不移动位置
  if (mainWindow) {
    // 缩小到紧凑模式
    const compactSize = { width: 180, height: 80 };
    mainWindow.setBounds(compactSize, false);
    
    // 可选：移动到屏幕角落
    const display = screen.getDisplayMatching(mainWindow?.getBounds() || screen.getPrimaryDisplay().bounds);
    const area = display?.workArea || screen.getPrimaryDisplay().workArea;
    const cornerPos = {
      x: area.x + area.width - compactSize.width - 20,
      y: area.y + area.height - compactSize.height - 20
    };
    mainWindow.setPosition(cornerPos.x, cornerPos.y, false);
    
    // 进入球模式（最小化）
    if (!state.isCollapsed) {
      toggleCollapse(true);
    }
  }
  return { success: true };
}`;

// 替换函数
content = content.replace(/async function handleStickBrowser\(payload = \{\}\) \{[\s\S]*?\n\}/, newHandleStickBrowser);

fs.writeFileSync(mainFile, content);
console.log('✅ 已修改贴边功能：只缩小到紧凑模式，不移动大浮窗');
