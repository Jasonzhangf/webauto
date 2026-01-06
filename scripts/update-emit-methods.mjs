#!/usr/bin/env node
import fs from 'fs/promises';

const filePath = 'services/controller/src/controller.ts';

async function main() {
  let content = await fs.readFile(filePath, 'utf-8');
  
  // Find the start of the three emit methods
  const startPattern = /private emitContainerAppearEvents\(/;
  const endPattern = /^  \}\n  \}\n\}/m; // Three closing braces for three methods + class
  
  const startIndex = content.search(startPattern);
  if (startIndex === -1) {
    console.log('❌ Could not find emitContainerAppearEvents method');
    return;
  }
  
  // Find the end by looking for the final closing brace of the class
  const afterStart = content.substring(startIndex);
  const classEndMatch = afterStart.match(/^}/m);
  if (!classEndMatch) {
    console.log('❌ Could not find end of class');
    return;
  }
  
  const endIndex = startIndex + classEndMatch.index;
  
  // Replace the old methods with the new implementation
  const newMethods = `private emitContainerAppearEvents(containerTree: any, context: { sessionId?: string; profileId?: string; url?: string; snapshot?: any }) {
    if (!this.messageBus?.publish) return;
    if (!containerTree || !containerTree.id) {
      logDebug('controller', 'emitContainerAppearEvents', 'No valid container tree provided');
      return;
    }

    const visited = new Set<string>();
    
    // Emit for root container (the containerTree itself)
    this.emitSingleContainerAppear(containerTree, context, visited);

    // Emit for all child containers in tree
    if (containerTree.children && Array.isArray(containerTree.children)) {
      for (const child of containerTree.children) {
        this.emitTreeContainerAppear(child, context, visited);
      }
    }
  }

  private emitSingleContainerAppear(container: any, context: { sessionId?: string; profileId?: string; url?: string }, visited: Set<string>) {
    if (!container || !container.id) return;
    const containerId = String(container.id);
    if (visited.has(containerId)) return;
    visited.add(containerId);

    const payload = {
      containerId,
      containerName: container.name || null,
      sessionId: context.sessionId,
      profileId: context.profileId,
      url: context.url,
      bbox: container.match?.bbox || container.bbox || null,
      visible: container.match?.visible ?? container.visible ?? null,
      score: container.match?.score ?? container.score ?? null,
      timestamp: Date.now(),
      source: 'containers:match',
    };

    this.messageBus?.publish?.('container:appear', payload);
    this.messageBus?.publish?.(\`container:\${containerId}:appear\`, payload);
    
    logDebug('controller', 'container:appear', { containerId, containerName: container.name });
  }

  private emitTreeContainerAppear(node: any, context: { sessionId?: string; profileId?: string; url?: string }, visited: Set<string>) {
    if (!node || !node.id) return;
    
    // Emit for this node (node itself is a container object)
    this.emitSingleContainerAppear(node, context, visited);
    
    // Recursively emit for children
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        this.emitTreeContainerAppear(child, context, visited);
      }
    }
  }
}`;
  
  const before = content.substring(0, startIndex);
  const after = content.substring(endIndex);
  
  content = before + newMethods;
  
  await fs.writeFile(filePath, content, 'utf-8');
  console.log('✅ Updated emit methods to match actual container tree structure');
}

main().catch(console.error);
