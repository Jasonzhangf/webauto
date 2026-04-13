#!/usr/bin/env node

/**
 * Weibo Special Follow Monitor CLI
 * 
 * 微博特别关注新帖监控 CLI 入口
 * 
 * 用法：
 *   webauto weibo special-follow update-user-list --profile xhs-qa-1
 *   webauto weibo special-follow inspect --profile xhs-qa-1
 *   webauto weibo special-follow status --profile xhs-qa-1
 *   webauto weibo special-follow start --profile xhs-qa-1 --interval 600000
 */

import minimist from 'minimist';
import {
  updateUserList,
  autoSyncUserList,
  runSingleInspection,
  startContinuousMonitor,
  getMonitorStatus,
} from './lib/weibo-special-follow-monitor-runner.mjs';

const args = minimist(process.argv.slice(2));
const profileId = args.profile || 'xhs-qa-1';
const subCommand = args._[0] || 'status';

async function main() {
  console.log(`[weibo-special-follow] profile=${profileId} command=${subCommand}`);

  if (subCommand === 'update-user-list' || subCommand === 'update') {
    const forceUpdate = args.force || args.f || false;
    const result = await updateUserList(profileId, forceUpdate);
    
    if (result.success) {
      console.log(`\n用户列表更新成功`);
      console.log(`总人数: ${result.total}`);
      console.log(`\n前 10 位用户:`);
      result.users.slice(0, 10).forEach((u, i) => {
        console.log(`  ${i + 1}. ${u.name} (${u.uid})`);
      });
    } else {
      console.error(`\n更新失败: ${result.error}`);
      console.error(`原因: ${result.message}`);
      process.exit(1);
    }
    
    process.exit(0);
  }

  
  if (subCommand === 'sync' || subCommand === 'auto-sync') {
    const forceUpdate = args.force || args.f || false;
    const result = await autoSyncUserList(profileId, { forceUpdate });
    
    if (result.success) {
      console.log('\n自动同步成功');
      console.log('新增: ' + result.added + ' 人');
      console.log('移除: ' + result.removed + ' 人');
      console.log('总计: ' + result.total + ' 人');
      
      if (result.added > 0) {
        console.log('\n新增用户:');
        result.addedUsers.forEach(u => console.log('  + ' + u.name + ' (' + u.uid + ')'));
      }
    } else {
      console.error('\n同步失败: ' + result.error);
      console.error('原因: ' + result.message);
      process.exit(1);
    }
    
    process.exit(0);
  }

if (subCommand === 'inspect' || subCommand === 'check') {
    const result = await runSingleInspection(profileId);
    
    if (result.success) {
      console.log(`\n巡检完成`);
      console.log(`检查人数: ${result.total}`);
      console.log(`发现新帖: ${result.newCount} 人`);
      console.log(`时间: ${result.timestamp}`);
      
      if (result.newCount > 0) {
        console.log(`\n新帖详情:`);
        result.newPosts.forEach((post, i) => {
          console.log(`  ${i + 1}. ${post.userName} (${post.uid})`);
          console.log(`     内容: ${post.contentPreview?.slice(0, 80)}...`);
          console.log(`     时间: ${post.timeISO}`);
          console.log(`     链接: ${post.postHref}`);
        });
      }
    } else {
      console.error(`\n巡检失败: ${result.error}`);
      console.error(`原因: ${result.message}`);
      process.exit(1);
    }
    
    process.exit(0);
  }

  if (subCommand === 'start' || subCommand === 'monitor') {
    const intervalMs = args.interval || 600000; // 默认 10 分钟
    const maxRounds = args['max-rounds'] || 100;
    const delayMs = args.delay || 5000;
    
    console.log(`启动持续监控`);
    console.log(`间隔: ${intervalMs}ms (${intervalMs / 60000} 分钟)`);
    console.log(`最大轮数: ${maxRounds}`);
    console.log(`用户间延迟: ${delayMs}ms`);
    
    const result = await startContinuousMonitor(profileId, {
      intervalMs,
      maxRounds,
      delayMs,
    });
    
    console.log(`\n监控结束`);
    console.log(`完成轮数: ${result.rounds}`);
    console.log(`发现新帖: ${result.totalNew} 人`);
    
    process.exit(0);
  }

  if (subCommand === 'status') {
    const result = await getMonitorStatus(profileId);
    
    console.log(`\n当前状态`);
    console.log(`用户总数: ${result.users.total}`);
    console.log(`已记录状态: ${result.postStates.total}`);
    console.log(`风控状态: ${result.riskControl.isRisk ? result.riskControl.riskType : '正常'}`);
    console.log(`当前页面: ${result.pageState.url}`);
    console.log(`数据目录: ${result.monitorDir}`);
    
    if (result.users.list.length > 0) {
      console.log(`\n前 10 位用户:`);
      result.users.list.forEach((u, i) => {
        const state = result.postStates.latest.find(([uid]) => uid === u.uid);
        const lastWeiboId = state ? state[1] : '未记录';
        console.log(`  ${i + 1}. ${u.name} (${u.uid}) - 最后微博: ${lastWeiboId}`);
      });
    }
    
    process.exit(0);
  }

  console.error(`未知命令: ${subCommand}`);
  console.error(`可用命令: update-user-list, inspect, start, status`);
  process.exit(1);
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
