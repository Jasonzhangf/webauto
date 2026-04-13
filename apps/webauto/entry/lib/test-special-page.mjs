import { callAPI } from '../../../../modules/camo-runtime/src/autoscript/shared/api-client.mjs';

const profileId = 'xhs-qa-1';

async function main\(\) {
  // Get current URL
  const urlScript = `location.href`;
  const currentUrl = await callAPI\('devtools:eval', { profileId, script: urlScript }\);
  console.log\('Current URL:', currentUrl\);
  
  // Check for "特别关注" header and find its parent container
  const specialScript = `
\(\(\) => {
  const result = { specialFollowUsers: [], userCards: [] };
  
  // Find the "特别关注" h3
  const specialH3 = [...document.querySelectorAll\('h3'\)].find\(h => h.textContent?.includes\('特别关注'\)\);
  if \(!specialH3\) return result;
  
  // Get the parent container \(likely has user cards inside\)
  const section = specialH3.closest\('[class*="panel"]'\) || specialH3.parentElement?.parentElement?.parentElement;
  
  // Find all user card links in this section
  if \(section\) {
    section.querySelectorAll\('[class*="user"], [class*="card"], a[href*="/u/"]'\).forEach\(el => {
      const href = el.getAttribute\('href'\) || el.closest\('a'\)?.getAttribute\('href'\) || '';
      const uidMatch = href.match\(/\\/u\\/\(\\d+\)/\);
      if \(uidMatch\) {
        result.specialFollowUsers.push\({
          uid: uidMatch[1],
          href: href,
          text: el.textContent?.trim\(\).slice\(0, 30\)
        }\);
      }
    }\);
  }
  
  // Also check all user cards on page
  document.querySelectorAll\('[class*="vue-recycle-scroller__item-view"]'\).forEach\(card => {
    const link = card.querySelector\('a[href*="/u/"]'\);
    if \(link\) {
      const href = link.getAttribute\('href'\) || '';
      const uidMatch = href.match\(/\\/u\\/\(\\d+\)/\);
      if \(uidMatch\) {
        result.userCards.push\({
          uid: uidMatch[1],
          href: href,
          name: link.textContent?.trim\(\).slice\(0, 30\)
        }\);
      }
    }
  }\);
  
  return result;
}\)\(\)
`;

  const specialResult = await callAPI\('devtools:eval', { profileId, script: specialScript }\);
  console.log\('\n特别关注区域分析:'\);
  console.log\(JSON.stringify\(specialResult, null, 2\)\);
}

main\(\).catch\(console.error\);
