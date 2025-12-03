/**
 * UI识别模块API路由主入口
 * 统一管理所有对外API接口
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { errorHandler } from './middleware/error-handler';
import { requestValidator } from './middleware/validation';

// 导入各服务路由
import recognitionRoutes from './routes/recognition';
import searchRoutes from './routes/search';
import actionRoutes from './routes/action';
import containerRoutes from './routes/container';
import contextRoutes from './routes/context';
import promptRoutes from './routes/prompt';
import healthRoutes from './routes/health';

export function createApiRouter(): express.Router {
  const router = express.Router();

  // 基础中间件
  router.use(helmet()); // 安全头
  router.use(cors({
    origin: config.cors.allowedOrigins,
    credentials: true
  }));

  // 限流中间件
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 限制每个IP 100个请求
    message: {
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  });
  router.use(limiter);

  // 请求日志
  router.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    next();
  });

  // 请求体验证
  router.use(express.json({ limit: '50mb' })); // 支持大图片上传
  router.use(express.urlencoded({ extended: true }));
  router.use(requestValidator);

  // API版本和基本信息
  router.get('/', (req, res) => {
    res.json({
      name: 'UI Recognition API',
      version: '1.0.0',
      description: 'Advanced UI recognition and automation API',
      endpoints: {
        recognition: '/recognition',
        search: '/search',
        action: '/action',
        container: '/container',
        context: '/context',
        prompt: '/prompt',
        health: '/health'
      },
      documentation: '/docs',
      status: 'operational'
    });
  });

  // 注册各服务路由
  router.use('/recognition', recognitionRoutes);
  router.use('/search', searchRoutes);
  router.use('/action', actionRoutes);
  router.use('/container', containerRoutes);
  router.use('/context', contextRoutes);
  router.use('/prompt', promptRoutes);
  router.use('/health', healthRoutes);

  // 404处理
  router.use('*', (req, res) => {
    res.status(404).json({
      error: 'Endpoint not found',
      code: 'NOT_FOUND',
      path: req.originalUrl,
      availableEndpoints: [
        '/recognition',
        '/search',
        '/action',
        '/container',
        '/context',
        '/health'
      ]
    });
  });

  // 错误处理（必须放在最后）
  router.use(errorHandler);

  return router;
}

export default createApiRouter;