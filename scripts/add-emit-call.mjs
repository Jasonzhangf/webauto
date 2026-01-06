#!/usr/bin/env node
import fs from 'fs/promises';

const filePath = 'services/controller/src/controller.ts';

async function main() {
  const content = await fs.readFile(filePath, 'utf-8');
  
  // Add the emitContainerAppearEvents call after containers.matched publish
  const lines = content.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    
    // Check if this is the containers.matched publish line
    if (lines[i].trim() === "this.messageBus?.publish?.('containers.matched', matchPayload);") {
      // Add the if block after it
      result.push('      if (matchPayload.container) {');
      result.push('        this.emitContainerAppearEvents(matchPayload.container, matchPayload);');
      result.push('      }');
    }
  }
  
  await fs.writeFile(filePath, result.join('\n'), 'utf-8');
  console.log('✅ Added emitContainerAppearEvents call');
}

main().catch(console.error);
