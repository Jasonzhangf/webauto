/**
 * UI Recognition Service - Main Entry Point
 * 主要入口文件，导出核心功能
 */

import UIRecognitionService from './UIRecognitionService.js';

// 导出主服务类
export { UIRecognitionService };

// 默认导出
export default UIRecognitionService;

// 便捷函数
export async function createService(config = {}) {
  const service = new UIRecognitionService(config);
  await service.start();
  return service;
}

// 版本信息
export const version = '0.1.0-basic';