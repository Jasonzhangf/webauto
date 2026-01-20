import { executeScript } from './xiaohongshu/search/lib/browser-helper.mjs';

(async () => {
  const res = await executeScript('location.href');
  console.log(JSON.stringify(res, null, 2));
})();
