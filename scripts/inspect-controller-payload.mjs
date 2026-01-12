import fs from 'node:fs';
import path from 'node:path';

const controllerPath = 'services/controller/src/controller.ts';
const content = fs.readFileSync(controllerPath, 'utf8');

const regex = /payload\.(profile|sessionId|profileId|profile_id|session_id)/g;
let match;
const matches = [];

while ((match = regex.exec(content)) !== null) {
  const lineNum = content.substring(0, match.index).split('\n').length;
  matches.push({ line: lineNum, text: match[0] });
}

console.log(JSON.stringify(matches, null, 2));
