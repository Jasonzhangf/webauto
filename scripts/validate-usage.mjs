import { getAllUsages } from '../modules/api-usage/src/index.js';
const usages = getAllUsages();
const actions = Object.keys(usages);
console.log('registered_actions', actions.length);
actions.sort().forEach((name) => console.log(name));
const dupes = [];
const seen = new Set();
for (const name of actions) {
  if (seen.has(name)) dupes.push(name);
  seen.add(name);
}
if (dupes.length) {
  console.warn('duplicate_actions', dupes.join(','));
}
