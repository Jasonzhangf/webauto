import fs from 'fs';

const mainFile = 'apps/floating-panel/electron/main.js';
let content = fs.readFileSync(mainFile, 'utf8');

// 新的处理函数：缩小为紧凑条，鼠标hover恢复
const newHandleStickBrowser = `
async function handleStickBrowser(payload = {}) {
  if (!mainWindow) return { success: false, error: 'no main window' };
  
  // 进入紧凑模式：缩小为一个小条
  const compactBar = { 
    width: 200,  // 小条宽度
    height: 40,  // 小条高度
    x: 0,        // 贴左边
    y: 0         // 贴上边
  };
  
  // 获取屏幕工作区域
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const area = display?.workArea || screen.getPrimaryDisplay().workArea;
  
  // 设置贴边位置（左上角）
  compactBar.x = area.x;
  compactBar.y = area.y;
  
  // 应用紧凑尺寸
  mainWindow.setBounds(compactBar, false);
  
  // 确保窗口可见且在最前
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.show();
  mainWindow.focus();
  
  // 设置鼠标hover事件监听
  setupHoverToRestore(compactBar);
  
  return { success: true };
}

function setupHoverToRestore(originalBounds) {
  if (!mainWindow) return;
  
  // 清除之前的监听器
  if (mainWindow._hoverTimer) {
    clearTimeout(mainWindow._hoverTimer);
  }
  
  // 鼠标进入事件：恢复窗口
  mainWindow.on('mouse-enter', () => {
    if (mainWindow._hoverTimer) {
      clearTimeout(mainWindow._hoverTimer);
    }
    
    // 恢复到正常大小
    const normalSize = { 
      width: NORMAL_SIZE.width, 
      height: NORMAL_SIZE.height 
    };
    
    // 确保在屏幕范围内
    const display = screen.getDisplayMatching(mainWindow.getBounds());
    const area = display?.workArea || screen.getPrimaryDisplay().workArea;
    
    let newX = mainWindow.getBounds().x;
    let newY = mainWindow.getBounds().y;
    
    // 调整位置确保不超出屏幕
    if (newX + normalSize.width > area.x + area.width) {
      newX = area.x + area.width - normalSize.width;
    }
    if (newY + normalSize.height > area.y + area.height) {
      newY = area.y + area.height - normalSize.height;
    }
    
    mainWindow.setBounds({
      x: newX,
      y: newY,
      width: normalSize.width,
      height: normalSize.height
    }, false);
  });
  
  // 鼠标离开事件：延迟恢复小条
  mainWindow.on('mouse-leave', () => {
    mainWindow._hoverTimer = setTimeout(() => {
      if (!mainWindow) return;
      mainWindow.setBounds(originalBounds, false);
    }, 500); // 500ms延迟，避免频繁切换
  });
}`;

// 替换函数
content = content.replace(/async function handleStickBrowser\(payload = \{\}\) \{[\s\S]*?\n\}/, newHandleStickBrowser);

fs.writeFileSync(mainFile, content);
console.log('✅ 已修改贴边功能：鼠标hover恢复，离开缩小为紧凑条');
