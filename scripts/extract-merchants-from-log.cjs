#!/usr/bin/env node

const fs = require('fs');

// 读取最新的商家数据文件
const recordsDir = './workflows/records';
const files = fs.readdirSync(recordsDir)
  .filter(f => f.includes('1688-extracted-merchants'))
  .sort()
  .reverse();

if (files.length === 0) {
  console.log('未找到商家数据文件');
  process.exit(1);
}

const latestFile = files[0];
console.log(`分析文件: ${latestFile}`);

try {
  const content = fs.readFileSync(`${recordsDir}/${latestFile}`, 'utf8');

  // 尝试查找商家数据
  const merchantMatch = content.match(/"merchants":\s*\[([^\]]*)\]/);
  if (merchantMatch) {
    const merchantData = merchantMatch[1];
    console.log('\n=== 提取的商家数据 ===');

    // 解析商家信息
    const merchants = [];
    const merchantObjects = merchantData.match(/\{[^}]*\}/g);

    if (merchantObjects) {
      merchantObjects.forEach((obj, index) => {
        console.log(`\n商家 ${index + 1}:`);

        // 提取各个字段
        const titleMatch = obj.match(/"title":\s*"([^"]*)"/);
        const merchantIdMatch = obj.match(/"merchantId":\s*"([^"]*)"/);
        const chatUrlMatch = obj.match(/"chatUrl":\s*"([^"]*)"/);
        const priceMatch = obj.match(/"price":\s*"([^"]*)"/);

        if (titleMatch) console.log(`  标题: ${titleMatch[1]}`);
        if (merchantIdMatch) console.log(`  商家ID: ${merchantIdMatch[1]}`);
        if (chatUrlMatch) console.log(`  聊天链接: ${chatUrlMatch[1]}`);
        if (priceMatch) console.log(`  价格: ${priceMatch[1]}`);

        merchants.push({
          index: index + 1,
          title: titleMatch ? titleMatch[1] : '',
          merchantId: merchantIdMatch ? merchantIdMatch[1] : '',
          chatUrl: chatUrlMatch ? chatUrlMatch[1] : '',
          price: priceMatch ? priceMatch[1] : ''
        });
      });
    }

    // 保存提取的商家数据
    const outputPath = `${recordsDir}/extracted-merchants-simple.json`;
    fs.writeFileSync(outputPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      sourceFile: latestFile,
      merchants: merchants
    }, null, 2));

    console.log(`\n✅ 已保存简化商家数据到: ${outputPath}`);
    console.log(`📊 总共提取了 ${merchants.length} 个商家`);

  } else {
    console.log('未找到商家数据，尝试其他方法...');

    // 查找可能的商家信息
    const lines = content.split('\n');
    let inMerchants = false;
    let merchantCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('找到') && line.includes('个商家')) {
        console.log(`发现商家统计: ${line.trim()}`);
      }
      if (line.includes('商家') && line.includes(':')) {
        console.log(`商家信息: ${line.trim()}`);
        merchantCount++;
      }
    }

    console.log(`\n📊 总共发现 ${merchantCount} 条商家相关信息`);
  }

} catch (error) {
  console.error('处理文件时出错:', error.message);
}