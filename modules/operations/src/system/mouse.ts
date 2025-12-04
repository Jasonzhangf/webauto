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
  let robot;
  try {
    robot = await import('robotjs');
  } catch {
    throw new Error('robotjs 未安装，无法执行全局输入。请运行 npm install robotjs');
  }
  const move = robot.moveMouse || robot.default?.moveMouse;
  const click = robot.mouseClick || robot.default?.mouseClick;
  if (typeof move !== 'function' || typeof click !== 'function') {
    throw new Error('robotjs 不支持当前平台或 API 变动，无法执行全局输入');
  }
  return {
    mouseMove: async (x: number, y: number) => move.call(robot, x, y),
    mouseClick: async (x: number, y: number, button = 'left', clicks = 1) => {
      move.call(robot, x, y);
      for (let i = 0; i < clicks; i += 1) {
        click.call(robot, button as any);
      }
    },
  };
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
