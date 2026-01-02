import type { OperationDefinition, OperationContext } from '../registry.js';

export interface MouseMoveConfig {
  x: number;
  y: number;
  steps?: number;
}

export interface MouseClickConfig {
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
  clicks?: number;
}

async function ensureRobot(ctx: OperationContext) {
  if (ctx.systemInput?.mouseMove && ctx.systemInput.mouseClick) {
    return ctx.systemInput;
  }
  
  // robotjs has been removed due to CI build issues on Linux
  // TODO: Replace with a cross-platform alternative or implement platform-specific solutions
  throw new Error('robotjs removed from dependencies. System-level mouse operations are currently unavailable.');
}

export const mouseMoveOperation: OperationDefinition<MouseMoveConfig> = {
  id: 'system:mouse-move',
  description: '移动系统鼠标到屏幕坐标',
  run: async (ctx, config) => {
    if (typeof config.x !== 'number' || typeof config.y !== 'number') {
      throw new Error('只支持全局屏幕坐标 (x,y)');
    }
    const sys = await ensureRobot(ctx);
    await sys.mouseMove(config.x, config.y, config.steps);
    return { success: true };
  },
};

export const mouseClickOperation: OperationDefinition<MouseClickConfig> = {
  id: 'system:mouse-click',
  description: '在屏幕坐标点击鼠标',
  run: async (ctx, config) => {
    if (typeof config.x !== 'number' || typeof config.y !== 'number') {
      throw new Error('只支持全局屏幕坐标 (x,y)');
    }
    const sys = await ensureRobot(ctx);
    await sys.mouseClick(config.x, config.y, config.button, config.clicks);
    return { success: true };
  },
};
