#!/usr/bin/env node
/**
 * 测试展开按钮的正则匹配逻辑
 */

const testCases = [
    "展开 2 条回复",
    "紫淡对的2025-12-03辽宁赞回复展开 2 条回复",
    "展开2条回复",
    "展开 10 条",
    "展开10条",
    "更多回复",
    "查看全部回复",
    "展开更多评论",
];

// 旧正则
const oldPattern = /展开\s*\d+\s*条/;

// 新正则：匹配"展开...N...条"（可能包含"回复"）
const newPattern = /展开\s*\d+\s*条(?:回复)?/;

console.log('🧪 测试展开按钮正则匹配\n');
console.log('旧正则:', oldPattern);
console.log('新正则:', newPattern);
console.log('');

testCases.forEach(text => {
    const oldMatch = oldPattern.test(text);
    const newMatch = newPattern.test(text);
    const differ = oldMatch !== newMatch;

    console.log(`文本: "${text}"`);
    console.log(`  旧正则: ${oldMatch ? '✅' : '❌'}`);
    console.log(`  新正则: ${newMatch ? '✅' : '❌'}${differ ? ' ⚠️ 不同！' : ''}`);
    console.log('');
});
