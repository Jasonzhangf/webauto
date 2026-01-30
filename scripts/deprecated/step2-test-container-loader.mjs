#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Step 2: 验证容器加载
 * 
 * 目标：
 * 1. 直接从 JSON 文件加载 weibo 容器
 * 2. 验证容器定义格式
 * 3. 输出加载的容器列表
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadContainers(dirPath) {
  const containers = [];
  const files = await getAllJsonFiles(dirPath);
  
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const containerDef = JSON.parse(content);
      containers.push(containerDef);
    } catch (error) {
      console.error(`Error loading ${file}:`, error.message);
    }
  }
  
  return containers;
}

async function getAllJsonFiles(dir) {
  const results = [];
  const items = await fs.readdir(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = await fs.stat(fullPath);
    
    if (stat.isDirectory()) {
      results.push(...await getAllJsonFiles(fullPath));
    } else if (item.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  
  return results;
}

async function main() {
  console.log('📦 Step 2: Testing Container Loader');
  console.log('=====================================\n');

  try {
    const containerLibPath = path.join(__dirname, '..', 'container-library', 'weibo');
    console.log(`📂 Loading containers from: ${containerLibPath}\n`);

    const containers = await loadContainers(containerLibPath);
    console.log(`✅ Loaded ${containers.length} containers:\n`);

    containers.forEach((container, index) => {
      console.log(`${index + 1}. ${container.id}`);
      console.log(`   Name: ${container.name || 'N/A'}`);
      console.log(`   Type: ${container.type || 'N/A'}`);
      console.log(`   Selectors: ${Array.isArray(container.selectors) ? container.selectors.length : 'object (css field)'}`);
      if (Array.isArray(container.selectors)) {
        container.selectors.forEach((sel, i) => {
          console.log(`      [${i}] css: ${sel.css || sel.classes?.join('. ') || 'N/A'}`);
        });
      } else if (typeof container.selectors === 'object') {
        console.log(`      css: ${container.selectors.css || 'N/A'}`);
      }
      console.log(`   Children: ${container.children?.length || 0}`);
      if (container.children?.length > 0) {
        console.log(`      -> ${container.children.join(', ')}`);
      }
      console.log(`   Operations: ${container.operations?.length || 0}`);
      if (container.operations?.length > 0) {
        container.operations.forEach((op, i) => {
          console.log(`      [${i}] ${op.type}`);
        });
      }
      console.log('');
    });

    const feedList = containers.find(c => c.id === 'weibo_main_page.feed_list');
    const feedPost = containers.find(c => c.id === 'weibo_main_page.feed_post');

    console.log('\n🎯 Key Containers Check:');
    console.log(`   feed_list: ${feedList ? '✅ Found' : '❌ Not Found'}`);
    console.log(`   feed_post: ${feedPost ? '✅ Found' : '❌ Not Found'}`);

    if (feedList && feedPost) {
      console.log('\n✅ All required containers found!');
      console.log('\n📋 Next Step: Test browser service and container matching');
    } else {
      console.log('\n❌ Missing required containers');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
