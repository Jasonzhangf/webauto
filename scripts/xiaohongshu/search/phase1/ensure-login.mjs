/**
 * Phase1: 登录检查（容器驱动版）
 *
 * 基于 EnsureLoginBlock 实现容器驱动的登录状态检测
 * 登录锚点模型：*.login_anchor（已登录）或 xiaohongshu_login.login_guard（未登录）
 */
import { execute as ensureLoginBlock } from '../../../../../dist/modules/workflow/blocks/EnsureLoginBlock.js';

export async function ensureLogin(logger) {
  logger.info('Checking login status (container-driven)...');

  const result = await ensureLoginBlock({
    sessionId: 'xiaohongshu_fresh',
    maxWaitMs: 120000,  // 2分钟超时
    checkIntervalMs: 3000
  });

  if (result.isLoggedIn) {
    logger.info(`✅ Login confirmed via ${result.loginMethod}, container: ${result.matchedContainer || 'unknown'}`);
    return { loggedIn: true, method: result.loginMethod };
  }

  logger.warn(`⚠️ Login check failed: ${result.error || 'Unknown reason'}`);
  return { loggedIn: false, error: result.error };
}
