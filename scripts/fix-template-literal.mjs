#!/usr/bin/env node
import fs from 'fs/promises';

const filePath = 'services/controller/src/controller.ts';

async function main() {
  let content = await fs.readFile(filePath, 'utf-8');
  
  // Fix the escaped backticks to proper template literal backticks
  content = content.replace(/this\.messageBus\?\.publish\?\(\\`container:\\\${containerId}:appear\\`/, 
    "this.messageBus?.publish?.(\\`container:\\${containerId}:appear\\`");
  
  await fs.writeFile(filePath, content, 'utf-8');
  console.log('✅ Fixed template literal backticks');
}

main().catch(console.error);
