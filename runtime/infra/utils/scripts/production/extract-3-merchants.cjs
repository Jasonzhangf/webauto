#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 查找最新的商家提取记录文件
const recordsDir = './workflows/records';
const files = fs.readdirSync(recordsDir)
  .filter(f => f.includes('1688-merchants-extracted'))
  .sort()
  .reverse();

if (files.length === 0) {
  console.log('未找到商家提取记录文件');
  process.exit(1);
}

const latestFile = files[0];
console.log(`分析文件: ${latestFile}`);

try {
  const content = fs.readFileSync(`${recordsDir}/${latestFile}`, 'utf8');
  const data = JSON.parse(content);

  // 查找页面快照中的脚本结果
  if (data.results && data.results.snapshot) {
    console.log('找到页面快照，尝试提取商家数据...');

    // 从HTML内容中提取商家信息
    const html = data.results.snapshot.html;

    // 使用正则表达式查找旺旺元素
    const wangwangRegex = /<span[^>]*class="J_WangWang[^"]*"[^>]*>.*?<\/span>/g;
    const wangwangMatches = html.match(wangwangRegex);

    if (wangwangMatches && wangwangMatches.length > 0) {
      console.log(`\n找到 ${wangwangMatches.length} 个旺旺元素`);

      const merchants = [];

      // 提取前3个商家信息
      for (let i = 0; i < Math.min(3, wangwangMatches.length); i++) {
        const wangwangHtml = wangwangMatches[i];

        // 提取商家名称
        const nickMatch = wangwangHtml.match(/data-nick="([^"]*)"/);
        const merchantName = nickMatch ? decodeURIComponent(nickMatch[1]) : '';

        // 提取聊天链接
        const linkMatch = wangwangHtml.match(/<a[^>]*href="([^"]*)"[^>]*class="ww-link[^"]*"/);
        const chatUrl = linkMatch ? linkMatch[1] : '';

        console.log(`\n商家 ${i + 1}:`);
        console.log(`  商家名称: ${merchantName}`);
        console.log(`  聊天链接: ${chatUrl}`);

        merchants.push({
          index: i + 1,
          merchantName: merchantName,
          chatUrl: chatUrl,
          wangwangHtml: wangwangHtml
        });
      }

      // 保存提取的商家数据
      const outputPath = `${recordsDir}/extracted-3-merchants.json`;
      fs.writeFileSync(outputPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        sourceFile: latestFile,
        merchants: merchants
      }, null, 2));

      console.log(`\n✅ 已保存商家数据到: ${outputPath}`);
      console.log(`📊 总共提取了 ${merchants.length} 个商家`);

    } else {
      console.log('未在HTML中找到旺旺元素');
    }
  } else {
    console.log('未找到页面快照数据');
  }

} catch (error) {
  console.error('处理文件时出错:', error.message);
}