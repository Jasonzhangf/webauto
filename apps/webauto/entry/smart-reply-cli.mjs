#!/usr/bin/env node
/**
 * smart-reply-cli.mjs
 * 
 * 智能回复 CLI 工具
 * 
 * 流程：
 * 1. 从已爬取的评论数据中分析高频关键词
 * 2. 展示给用户选择
 * 3. 用户指定回复中心意思
 * 4. dryrun 模式验证
 * 5. 真实回复（可选）
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { createInterface } from 'readline';
import { spawn } from 'child_process';

// 统一路径解析（与项目一致）
function resolveWebautoRoot() {
  const explicit = String(process.env.WEBAUTO_HOME || '').trim();
  if (explicit) return explicit;
  
  const legacy = String(process.env.WEBAUTO_ROOT || process.env.WEBAUTO_PORTABLE_ROOT || '').trim();
  if (legacy) {
    const base = path.basename(legacy).toLowerCase();
    return (base === '.webauto' || base === 'webauto') ? legacy : path.join(legacy, '.webauto');
  }
  
  if (process.platform === 'win32') {
    const dExists = fs.existsSync('D:\\');
    return dExists ? 'D:\\webauto' : path.join(os.homedir(), '.webauto');
  }
  return path.join(os.homedir(), '.webauto');
}

const WEBAUTO_ROOT = resolveWebautoRoot();
const DOWNLOAD_ROOT = path.join(WEBAUTO_ROOT, 'download');

// 简单的中文分词
function tokenize(text) {
  return text
    .replace(/[，。！？、；：""''（）【】《》\s]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && t.length <= 10);
}

// 统计词频
function countKeywords(comments) {
  const wordFreq = new Map();
  
  for (const comment of comments) {
    const tokens = tokenize(comment.content || comment.text || '');
    for (const token of tokens) {
      wordFreq.set(token, (wordFreq.get(token) || 0) + 1);
    }
  }
  
  return Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));
}

// 加载评论数据
function loadComments(keyword) {
  const comments = [];
  
  const searchDirs = [DOWNLOAD_ROOT];
  
  for (const searchDir of searchDirs) {
    if (!fs.existsSync(searchDir)) continue;
    
    const findJsonlFiles = (dir) => {
      const files = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules') continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...findJsonlFiles(full));
          } else if (entry.name === 'comments.jsonl') {
            files.push(full);
          }
        }
      } catch {}
      return files;
    };
    
    const files = findJsonlFiles(searchDir);
    
    for (const file of files) {
      if (keyword && !file.includes(keyword)) continue;
      
      try {
        const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const comment = JSON.parse(line);
            comments.push({ ...comment, file });
          } catch {}
        }
      } catch {}
    }
  }
  
  return comments;
}

// CLI 交互
async function main() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
  
  console.log('========================================');
  console.log('  小红书智能回复工具');
  console.log('========================================\n');
  console.log(`数据目录: ${WEBAUTO_ROOT}\n`);
  
  // 1. 输入关键词
  const keyword = await question('请输入已爬取的关键词目录（如 deepseek）: ');
  
  console.log('\n正在加载评论数据...');
  const comments = loadComments(keyword.trim());
  
  if (comments.length === 0) {
    console.log('未找到评论数据，请先运行爬取任务');
    rl.close();
    return;
  }
  
  console.log(`找到 ${comments.length} 条评论\n`);
  
  // 2. 分析高频词
  console.log('正在分析评论关键词...\n');
  const keywords = countKeywords(comments).slice(0, 20);
  
  console.log('高频关键词 TOP 20:');
  console.log('-'.repeat(40));
  keywords.forEach((item, i) => {
    console.log(`${(i + 1).toString().padStart(2)}. ${item.word.padEnd(15)} (${item.count}次)`);
  });
  console.log('-'.repeat(40));
  
  // 3. 选择关键词
  const selectedKeywords = await question('\n请选择要匹配的关键词（多个用逗号分隔，如: 牛逼,厉害）: ');
  const matchKeywords = selectedKeywords.split(/[,，]/).map(k => k.trim()).filter(Boolean);
  
  if (matchKeywords.length === 0) {
    console.log('未选择关键词');
    rl.close();
    return;
  }
  
  // 4. 筛选命中评论
  const matchedComments = comments.filter(c => {
    const text = (c.content || c.text || '').toLowerCase();
    return matchKeywords.some(k => text.includes(k.toLowerCase()));
  });
  
  console.log(`\n命中评论数: ${matchedComments.length}`);
  
  if (matchedComments.length === 0) {
    console.log('没有命中任何评论');
    rl.close();
    return;
  }
  
  // 5. 展示部分命中评论
  console.log('\n命中评论预览 (前5条):');
  console.log('-'.repeat(60));
  matchedComments.slice(0, 5).forEach((c, i) => {
    const text = (c.content || c.text || '').slice(0, 50);
    console.log(`${i + 1}. [${c.userName || '匿名'}] ${text}...`);
  });
  console.log('-'.repeat(60));
  
  // 6. 指定回复中心意思
  const replyIntent = await question('\n请输入回复的中心意思（如: 感谢认可，告诉对方具体信息）: ');
  
  if (!replyIntent.trim()) {
    console.log('未输入回复意图');
    rl.close();
    return;
  }
  
  // 7. 选择模式
  const mode = await question('\n选择模式: (1) dryrun预览 (2) 真实回复: ');
  const dryRun = mode.trim() === '1' || mode.trim().toLowerCase() === 'dryrun';
  
  // 8. 确认
  console.log('\n' + '='.repeat(50));
  console.log('配置确认:');
  console.log(`  关键词目录: ${keyword}`);
  console.log(`  匹配关键词: ${matchKeywords.join(', ')}`);
  console.log(`  命中评论数: ${matchedComments.length}`);
  console.log(`  回复意图: ${replyIntent}`);
  console.log(`  模式: ${dryRun ? 'dryrun（预览）' : '真实回复'}`);
  console.log('='.repeat(50));
  
  const confirm = await question('\n确认执行？(y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('已取消');
    rl.close();
    return;
  }
  
  // 9. 输出配置文件
  const config = {
    keyword: keyword.trim(),
    matchKeywords,
    replyIntent: replyIntent.trim(),
    dryRun,
    comments: matchedComments.slice(0, dryRun ? 3 : undefined),
    timestamp: new Date().toISOString(),
  };
  
  const configPath = path.join(WEBAUTO_ROOT, 'smart-reply-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log(`\n配置已保存到: ${configPath}`);
  console.log('\n后续步骤:');
  console.log('1. 确保 Unified API 运行中 (http://127.0.0.1:7701)');
  console.log('2. 确保浏览器 session 已打开小红书页面');
  console.log('3. 运行 SmartReplyBlock 进行实际回复');
  
  // 10. 测试 AI 生成（在关闭 rl 之前）
  const testGenerate = await question('\n是否立即测试 AI 生成回复？(y/n): ');
  if (testGenerate.toLowerCase() === 'y') {
    console.log('\n正在生成测试回复...\n');
    
    const testComment = matchedComments[0];
    const prompt = `你是一个小红书评论回复助手。请根据以下信息生成一条回复。

## 帖子评论
${testComment.content || testComment.text || ''}

## 回复要求
- 回复的中心意思：${replyIntent}
- 回复风格：友好、自然、口语化
- 字数限制：100字以内
- 不要使用表情符号开头
- 可以适当使用 1-2 个表情符号

请直接输出回复内容，不要有任何解释或说明。`;

    // 在关闭 rl 之前启动子进程
    const child = spawn('iflow', ['-p', prompt], { stdio: 'inherit' });
    
    // 关闭 readline
    rl.close();
    
    await new Promise(resolve => child.on('close', resolve));
  } else {
    rl.close();
  }
}

main().catch(console.error);
