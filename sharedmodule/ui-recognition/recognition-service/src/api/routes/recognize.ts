/**
 * 底层识别服务 - 识别API路由
 * 纯粹的识别功能，无业务逻辑
 */

import { Router } from 'express';
import { ModelClient } from '../../core/model-client';
import { RecognitionRequest } from '../../types/element';

const router = Router();

// 创建模型客户端实例
const modelClient = new ModelClient();

/**
 * 基础UI识别
 * POST /recognize
 */
router.post('/recognize', async (req, res) => {
  try {
    const request: RecognitionRequest = req.body;

    // 验证请求参数
    if (!request.image) {
      return res.status(400).json({
        success: false,
        error: 'Image is required'
      });
    }

    // 调用模型进行识别
    const result = await modelClient.recognize(request);

    res.json(result);
  } catch (error) {
    console.error('Recognition API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * 元素搜索
 * POST /search
 */
router.post('/search', async (req, res) => {
  try {
    const { image, search_query, search_type, filters } = req.body;

    if (!image || !search_query) {
      return res.status(400).json({
        success: false,
        error: 'Image and search_query are required'
      });
    }

    const searchRequest = {
      image,
      search_query,
      search_type: search_type || 'text',
      filters
    };

    const result = await modelClient.search(searchRequest);
    res.json(result);
  } catch (error) {
    console.error('Search API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * 健康检查
 * GET /health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await modelClient.healthCheck();
    res.json({
      status: 'ok',
      service: 'recognition-service',
      model: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      service: 'recognition-service',
      error: error instanceof Error ? error.message : 'Health check failed'
    });
  }
});

export default router;