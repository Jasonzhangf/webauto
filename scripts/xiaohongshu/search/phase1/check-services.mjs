/**
 * Phase1: 服务检查
 */
import { browserCommand } from '../lib/browser-helper.mjs';

const UNIFIED_API = 'http://127.0.0.1:7701';

export async function checkServices(logger) {
  logger.info('Checking services...');
  
  // 1. Unified API
  try {
    const res = await fetch(`${UNIFIED_API}/health`);
    if (!res.ok) throw new Error('Unified API unhealthy');
    logger.info('✅ Unified API online');
  } catch (err) {
    logger.error('Unified API check failed');
    throw err;
  }

  // 2. Browser Service
  try {
    await browserCommand('getStatus');
    logger.info('✅ Browser Service online');
  } catch (err) {
    logger.error('Browser Service check failed');
    throw err;
  }
}
