#!/usr/bin/env node
/**
 * 重新生成 container-library.index.json
 * 扫描 container-library 下每个平台目录，收集所有 container.json 文件
 */
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTAINER_LIB = join(__dirname, '..', 'container-library');
const INDEX_FILE = join(CONTAINER_LIB, 'container-library.index.json');
async function scanContainers(dir, platform) {
  const containers = [];
  async function walk(currentPath, prefix = '') {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, prefix ? `${prefix}.${entry.name}` : entry.name);
      } else if (entry.name === 'container.json') {
        try {
          const content = await readFile(fullPath, 'utf8');
          const container = JSON.parse(content);
          // 构建容器ID（平台.路径）
          const containerId = prefix ? `${platform}_${prefix}` : platform;
          containers.push({            id: containerId,
            path: fullPath.replace(CONTAINER_LIB + '/', ''),
            selector: container.selector
          });
        } catch (err) {
          console.warn(`⚠️  跳过无效容器: ${fullPath}`, err.message);
        }
      }
    }
  }
  await walk(dir);
  return containers;
}
async function main() {
  console.log('🔄 重新生成 container-library.index.json...\n');
  const platforms = await readdir(CONTAINER_LIB, { withFileTypes: true });
  const index = {};
  for (const entry of platforms) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const platform = entry.name;
    console.log(`📦 扫描平台: ${platform}`);
    const containers = await scanContainers(join(CONTAINER_LIB, platform), platform);
    index[platform] = containers;
    console.log(`   找到 ${containers.length} 个容器`);
  }
  await writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`\n✅ 索引已生成: ${INDEX_FILE}`);
  console.log(`   总计 ${Object.keys(index).length} 个平台`);
}
main().catch(console.error);
