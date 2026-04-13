import { callAPI } from '../../../../modules/camo-runtime/src/autoscript/shared/api-client.mjs';

const profileId = 'xhs-qa-1';

// Step 1: 检查当前 URL
const urlResult = await callAPI('devtools:eval', { profileId, script: 'location.href' });
console.log('URL:', urlResult);

// Step 2: 检查特别关注区域下的用户卡片
const script = `
(() => {
  const result = { users: [], structure: [] };
  
  // 找到"特别关注" H3
  const h3s = [...document.querySelectorAll('h3')];
  const specialH3 = h3s.find(h => h.textContent?.includes('特别关注'));
  
  if (!specialH3) {
    result.structure.push('no special follow h3 found');
    return result;
  }
  
  // 向上找到分组容器
  let container = specialH3;
  for (let i = 0; i < 5; i++) {
    container = container.parentElement;
    if (!container) break;
    const links = container.querySelectorAll('a[href*="/u/"]');
    if (links.length > 1) {
      result.structure.push({
        level: i + 1,
        tag: container.tagName,
        class: container.className?.slice(0, 60),
        linkCount: links.length
      });
      
      // 提取用户
      links.forEach(link => {
        const href = link.getAttribute('href') || '';
        const uidMatch = href.match(/\/u\/(\d+)/);
        if (uidMatch) {
          result.users.push({
            uid: uidMatch[1],
            href: href,
            text: link.textContent?.trim().slice(0, 30)
          });
        }
      });
      break;
    }
  }
  
  return result;
})()
`;
const evalResult = await callAPI('devtools:eval', { profileId, script });
console.log('特别关注用户:', JSON.stringify(evalResult));
