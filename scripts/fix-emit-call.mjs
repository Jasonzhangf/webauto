#!/usr/bin/env node
import fs from 'fs/promises';

const filePath = 'services/controller/src/controller.ts';

async function main() {
  let content = await fs.readFile(filePath, 'utf-8');
  
  // Change matchPayload.container to snapshot.container_tree
  content = content.replace(
    'this.emitContainerAppearEvents(matchPayload.container, matchPayload);',
    'this.emitContainerAppearEvents(snapshot.container_tree, matchPayload);'
  );
  
  await fs.writeFile(filePath, content, 'utf-8');
  console.log('✅ Updated emitContainerAppearEvents call to use snapshot.container_tree');
}

main().catch(console.error);
