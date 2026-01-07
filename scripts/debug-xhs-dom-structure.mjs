/**
 * 诊断脚本：查找搜索结果列表的父容器选择器
 */
const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function main() {
  const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `(() => {
          const item = document.querySelector('.note-item');
          if (!item) return { error: 'No .note-item found' };
          
          const parents = [];
          let p = item.parentElement;
          while (p && p !== document.body) {
            parents.push({
              tag: p.tagName.toLowerCase(),
              id: p.id,
              className: p.className
            });
            p = p.parentElement;
          }
          return { parents };
        })()`
      }
    })
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data.data?.result, null, 2));
}

main();
