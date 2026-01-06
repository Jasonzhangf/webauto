#!/usr/bin/env node
import fs from 'fs/promises';

const filePath = 'services/controller/src/controller.ts';

async function updateController() {
  const content = await fs.readFile(filePath, 'utf-8');
  
  // Find and replace the handleContainerMatch method
  const updatedContent = content.replace(
    /this\.messageBus\?\.publish\?\('containers\.matched', matchPayload\);/,
    `this.messageBus?.publish?.('containers.matched', matchPayload);
      if (matchPayload.container) {
        this.emitContainerAppearEvents(matchPayload.container, matchPayload);
      }`
  );
  
  await fs.writeFile(filePath, updatedContent, 'utf-8');
  console.log('✅ Updated handleContainerMatch with emitContainerAppearEvents call');
}

updateController().catch(console.error);
