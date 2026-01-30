#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书采集 Orchestrator（统一入口）
 * 
 * 功能：
 * - 统一入口：Phase1 → Phase2 → Phase3 → Phase4
 * - 参数统一：keyword/target/env/sessionId
 * - 状态管理：断点恢复
 * - 失败处理：明确失败阶段与原因
 * - 日志一致：统一记录关键节点
 * - 落盘规范：~/.webauto/download/xiaohongshu/{env}/{keyword}/
 * 
 * 调试模式 (--debug)：
 * - 容器高亮：每步操作前高亮容器
 * - 截图：每步操作后截图
 * - 详细日志：打印每个步骤的详细信息
 */

import { program } from 'commander';
import Logger from './lib/logger.mjs';
import { loadState, saveState, createInitialState } from './shared/state.mjs';
import { checkServices } from './phase1/check-services.mjs';
import { ensureLogin } from './phase1/ensure-login.mjs';
import { collectList } from './phase2/collect-list.mjs';
import { collectDetail } from './phase3/collect-detail.mjs';
import { collectComments } from './phase4/collect-comments.mjs';
import { controllerAction } from './lib/browser-helper.mjs';

const PROFILE = 'xiaohongshu_fresh';
const SERVICE_URL = 'http://127.0.0.1:7701';

// 解析参数
program
  .requiredOption('--keyword <keyword>', '搜索关键字')
  .option('--target <number>', '目标采集数量', '50')
  .option('--env <env>', '环境标识（debug/prod）', 'download')
  .option('--sessionId <sessionId>', '会话 ID', PROFILE)
  .option('--debug', '调试模式（高亮+截图+详细日志）', false)
  .option('--resume', '断点恢复', false)
  .parse();

const options = program.opts();
const targetCount = parseInt(options.target, 10);

// 创建日志
const logger = new Logger(options.keyword, options.env);

// 调试模式辅助函数
async function debugHighlightAndScreenshot(containerId, stepName) {
  if (!options.debug) return;
  
  try {
    logger.info(`[DEBUG] 高亮容器: ${containerId}`);
    await controllerAction('container:operation', {
      containerId,
      operationId: 'highlight',
      config: { duration: 2000 },
      sessionId: options.sessionId
    });
    
    logger.info(`[DEBUG] 截图: ${stepName}`);
    const screenshotRes = await controllerAction('browser:screenshot', {
      profile: options.sessionId,
      fullPage: false
    });
    
    if (screenshotRes.success) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const screenshotPath = `~/.webauto/download/xiaohongshu/${options.env}/${options.keyword}/debug-${stepName}-${timestamp}.png`;
      logger.info(`[DEBUG] 截图已保存: ${screenshotPath}`);
    }
  } catch (error) {
    logger.warn(`[DEBUG] 高亮/截图失败: ${error.message}`);
  }
}

async function main() {
  const startTime = Date.now();
  
  logger.info('=== 小红书采集 Orchestrator 启动 ===');
  logger.info(`关键字: ${options.keyword}`);
  logger.info(`目标数量: ${targetCount}`);
  logger.info(`环境: ${options.env}`);
  logger.info(`会话: ${options.sessionId}`);
  logger.info(`调试模式: ${options.debug ? '开启' : '关闭'}`);
  logger.info(`断点恢复: ${options.resume ? '开启' : '关闭'}`);
  
  try {
    // 0. 加载或初始化状态
    let state = options.resume ? await loadState(options.keyword, options.env) : null;
    if (!state) {
      state = createInitialState(options.keyword, options.env, targetCount);
      logger.info('初始化采集状态');
    } else {
      logger.info(`恢复采集状态: 已采集 ${state.collectedNoteIds.length}/${state.targetCount}`);
    }
    
    logger.event('orchestrator_start', { keyword: options.keyword, targetCount, env: options.env });
    
    // 1. Phase1: 服务检查 + 登录
    logger.info('>>> Phase1: 服务检查 + 登录');
    await checkServices(logger);
    
    const loginResult = await ensureLogin(logger);
    if (!loginResult.loggedIn) {
      throw new Error(`登录失败: ${loginResult.error}`);
    }
    
    logger.event('phase1_complete', { method: loginResult.method });
    
    // 2. Phase2: 列表采集
    logger.info('>>> Phase2: 列表采集');
    
    const items = await collectList(options.keyword, targetCount, logger);
    logger.info(`Phase2 完成: 采集到 ${items.length} 个项目`);
    
    logger.event('phase2_complete', { itemCount: items.length });
    
    // 3. Phase3+4: 详情 + 评论（逐条处理）
    logger.info('>>> Phase3+4: 详情 + 评论采集');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const item of items) {
      const noteId = item.noteId;
      
      // 跳过已采集
      if (state.collectedNoteIds.includes(noteId)) {
        logger.info(`跳过已采集: ${noteId}`);
        continue;
      }
      
      logger.info(`处理笔记 ${noteId} (${successCount + 1}/${items.length})`);
      
      try {
        // 调试模式：高亮列表项
        await debugHighlightAndScreenshot(item.containerId, `before-detail-${noteId}`);
        
        // Phase3: 详情采集
        const detailResult = await collectDetail(item, logger);
        if (!detailResult.success) {
          throw new Error(`详情采集失败: ${detailResult.error}`);
        }
        
        // 调试模式：详情页截图
        await debugHighlightAndScreenshot('xiaohongshu_detail.content', `after-detail-${noteId}`);
        
        // Phase4: 评论采集
        const commentsResult = await collectComments(item, logger, options.env);
        if (!commentsResult.success) {
          logger.warn(`评论采集失败: ${commentsResult.error}`);
        }
        
        // 调试模式：评论区截图
        await debugHighlightAndScreenshot('xiaohongshu_detail.comment_section', `after-comments-${noteId}`);
        
        // 更新状态
        state.collectedNoteIds.push(noteId);
        await saveState(options.keyword, options.env, state);
        
        successCount++;
        logger.event('note_complete', { noteId, successCount });
        
      } catch (error) {
        failCount++;
        state.failedNoteIds.push(noteId);
        await saveState(options.keyword, options.env, state);
        
        logger.error(`笔记 ${noteId} 处理失败: ${error.message}`);
        logger.event('note_failed', { noteId, error: error.message, failCount });
      }
    }
    
    // 完成
    const duration = Date.now() - startTime;
    logger.info('=== 采集完成 ===');
    logger.info(`成功: ${successCount}`);
    logger.info(`失败: ${failCount}`);
    logger.info(`耗时: ${Math.floor(duration / 1000)}s`);
    logger.info(`输出目录: ~/.webauto/download/xiaohongshu/${options.env}/${options.keyword}/`);
    
    logger.event('orchestrator_complete', {
      successCount,
      failCount,
      duration,
      outputDir: `~/.webauto/download/xiaohongshu/${options.env}/${options.keyword}/`
    });
    
  } catch (error) {
    logger.error(`=== 采集失败 ===`);
    logger.error(error.message);
    logger.event('orchestrator_failed', { error: error.message });
    process.exit(1);
  }
}

main();
