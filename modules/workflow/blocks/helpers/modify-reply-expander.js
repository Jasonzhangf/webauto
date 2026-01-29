const fs = require('fs');

const filePath = 'd:/github/webauto/modules/workflow/blocks/helpers/replyExpander.ts';

let content = fs.readFileSync(filePath, 'utf8');

// 替换注释
content = content.replace(
    '// 开发阶段严格要求：必须"完全在视口内"才允许点击，避免点到截断按钮造成误触',
    '// 放宽可见性要求：只要部分在视口内即可（systemClickAt 会自动滚动）\n              // 之前要求完全在视口内 (rect.bottom <= viewportH)，但这对大元素过于严格'
);

// 替换第一个条件
content = content.replace(
    'if (!(rect.top >= 0 && rect.bottom <= viewportH)) continue;',
    'if (rect.bottom <= 0 || rect.top >= viewportH) continue;'
);

// 替换第二个条件  
content = content.replace(
    'if (!(rect.left >= 0 && rect.right <= viewportW)) continue;',
    'if (rect.right <= 0 || rect.left >= viewportW) continue;'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Modified replyExpander.ts successfully');
