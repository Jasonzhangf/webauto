#!/usr/bin/env node

/**
 * 从现有微博文件中提取嵌入式评论
 * 由于微博评论通常嵌入在内容文本中，使用正则表达式提取
 */

const fs = require('fs-extra');
const path = require('path');

class EmbeddedCommentExtractor {
    constructor() {
        this.inputDir = process.env.INPUT_DIR || '~/.webauto/2025-09-13/homepage';
        this.commentsDir = path.join(this.inputDir, 'with-comments');
        this.results = {
            processedFiles: 0,
            filesWithComments: 0,
            totalComments: 0
        };
    }

    async initialize() {
        console.log('🚀 初始化嵌入式评论提取工具...');
        
        // 确保目录存在
        await fs.ensureDir(this.commentsDir);
        
        console.log('✅ 初始化完成');
    }

    async processAllFiles() {
        console.log('📝 处理微博文件，提取嵌入式评论...');
        
        const files = await fs.readdir(this.inputDir);
        
        for (const file of files) {
            if (file.startsWith('post_') && file.endsWith('.md')) {
                await this.processFile(file);
            }
        }
        
        console.log(`\n📊 处理完成:`);
        console.log(`📁 处理文件数: ${this.results.processedFiles}`);
        console.log(`💬 有评论的文件: ${this.results.filesWithComments}`);
        console.log(`🔢 总评论数: ${this.results.totalComments}`);
    }

    async processFile(fileName) {
        const filePath = path.join(this.inputDir, fileName);
        const content = await fs.readFile(filePath, 'utf8');
        
        this.results.processedFiles++;
        
        // 提取嵌入式评论
        const comments = this.extractCommentsFromContent(content);
        
        if (comments.length > 0) {
            this.results.filesWithComments++;
            this.results.totalComments += comments.length;
            
            // 创建包含评论的版本
            await this.createCommentedVersion(fileName, content, comments);
            
            console.log(`✅ ${fileName}: 提取了 ${comments.length} 条评论`);
        } else {
            console.log(`⚪ ${fileName}: 无评论`);
        }
    }

    extractCommentsFromContent(content) {
        const comments = [];
        
        // 提取微博内容部分（支持同一行和换行两种格式）
        let postContent = '';
        const contentMatch1 = content.match(/\*\*内容:\*\*\s*\n([\s\S]+?)\n---/);
        const contentMatch2 = content.match(/## 内容\s*\n([^\n]+)/);
        
        if (contentMatch1) {
            postContent = contentMatch1[1];
        } else if (contentMatch2) {
            postContent = contentMatch2[1];
        }
        
        if (!postContent) return comments;
        
        // 使用正则表达式提取评论
        // 匹配 //@用户名:评论内容 格式，并处理嵌套评论
        const commentPatterns = [
            /\/\/@([^:@]+):([^@]+)/g,
            /@([^:@]+):([^@]+)/g,
            /([^@\n]+?):\s*([^\n]+?)\s*(\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})/g,
            /([^@\n]+?):\s*([^\n]+?)\s*来自([^\n]+)/g,
            /([^@\n]+?):\s*([^\n]+?)(?=\n[^\n]+?:|$)/g
        ];
        
        for (const pattern of commentPatterns) {
            let match;
            while ((match = pattern.exec(postContent)) !== null) {
                let author, commentContent, time;
                
                if (match[0].startsWith('//@')) {
                    // //@用户名:评论内容 格式
                    author = match[1].trim();
                    commentContent = match[2].trim();
                    time = '';
                    
                    // 移除嵌套的评论引用
                    commentContent = commentContent.replace(/\/\/@[^:@]+:[^@]+/g, '').trim();
                    commentContent = commentContent.replace(/@[^:@]+:[^@]+/g, '').trim();
                } else if (match[0].startsWith('@') && !match[0].startsWith('//@')) {
                    // @用户名:评论内容 格式
                    author = match[1].trim();
                    commentContent = match[2].trim();
                    time = '';
                } else {
                    // 标准 用户名:评论内容 格式
                    author = match[1].trim();
                    commentContent = match[2].trim();
                    time = match[3] ? match[3].trim() : '';
                }
                
                // 过滤掉非评论内容
                if (this.isValidComment(author, commentContent)) {
                    comments.push({
                        id: `comment_${comments.length}`,
                        author: { name: author },
                        content: commentContent,
                        publishTime: time,
                        index: comments.length + 1
                    });
                }
            }
        }
        
        // 去重
        const uniqueComments = [];
        const seen = new Set();
        
        for (const comment of comments) {
            const key = `${comment.author.name}-${comment.content}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueComments.push(comment);
            }
        }
        
        return uniqueComments;
    }

    isValidComment(author, content) {
        // 排除无效的评论
        const invalidAuthors = ['首页', '返回', '展开', '发布于', '来自', '关注'];
        const invalidPatterns = [/^\d+$/, /^\s+$/, /^来自/, /^发布于/];
        
        if (invalidAuthors.includes(author)) return false;
        if (invalidPatterns.some(pattern => pattern.test(author))) return false;
        if (content.length < 2) return false;
        if (content.length > 500) return false; // 过长的内容可能是正文
        
        return true;
    }

    async createCommentedVersion(originalFileName, originalContent, comments) {
        // 提取原始微博信息
        const urlMatch = originalContent.match(/\[查看原文\]\((https:\/\/weibo\.com\/[^)]+)\)/);
        const originalUrl = urlMatch ? urlMatch[1] : '';
        const postId = originalFileName.replace('.md', '').split('_')[1];
        
        // 创建新的文件名
        const newFileName = `post_with_embedded_comments_${postId}.md`;
        const newFilePath = path.join(this.commentsDir, newFileName);
        
        // 提取微博基本信息
        const userMatch = originalContent.match(/\*\*用户:\*\*\s*([^\n]+)/);
        const user = userMatch ? userMatch[1].trim() : '';
        
        const timeMatch = originalContent.match(/\*\*时间信息:\*\*\s*([^\n]+)/);
        const time = timeMatch ? timeMatch[1].trim() : '';
        
        // 构建新的内容
        const newContent = `# 微博详情与嵌入式评论

## 基本信息
- **原文链接:** ${originalUrl}
- **来源文件:** ${originalFileName}
- **用户:** ${user}
- **发布时间:** ${time}
- **评论数量:** ${comments.length}条

---

## 微博内容

${this.extractMainContent(originalContent)}

---

## 嵌入式评论 (${comments.length}条)

${comments.map(comment => `
### 评论 ${comment.index}

**作者:** ${comment.author.name}
**时间:** ${comment.publishTime}

**内容:**
${comment.content}

---
`).join('')}

*此文件由嵌入式评论提取工具自动生成*`;

        await fs.writeFile(newFilePath, newContent, 'utf8');
    }

    extractMainContent(content) {
        // 提取主要的微博内容，排除评论
        const contentMatch = content.match(/\*\*内容:\*\*\s*\n([\s\S]+?)\n---/);
        if (!contentMatch) return '';
        
        let mainContent = contentMatch[1];
        
        // 移除评论部分
        mainContent = mainContent.replace(/\/\/@[^\n]+:\s*[^\n]+/g, '');
        mainContent = mainContent.replace(/[^\n]+?:\s*[^\n]+?\s*\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}/g, '');
        mainContent = mainContent.replace(/来自[^\n]+/g, '');
        mainContent = mainContent.replace(/\s+/g, ' ').trim();
        
        return mainContent;
    }

    async generateSummary() {
        const summaryPath = path.join(this.commentsDir, '嵌入式评论提取汇总报告.md');
        
        const report = `# 嵌入式评论提取汇总报告

## 📊 提取统计
- **处理文件数:** ${this.results.processedFiles}
- **有评论的文件:** ${this.results.filesWithComments}
- **总评论数:** ${this.results.totalComments}
- **提取成功率:** ${((this.results.filesWithComments / this.results.processedFiles) * 100).toFixed(1)}%

## 📁 输出文件
所有包含嵌入式评论的文件保存在: ${this.commentsDir}

## 📈 平均统计
- **每文件平均评论数:** ${(this.results.totalComments / this.results.filesWithComments).toFixed(1)}条

---

**生成时间:** ${new Date().toLocaleString()}
**工具:** 嵌入式评论提取工具 v1.0`;

        await fs.writeFile(summaryPath, report, 'utf8');
        console.log(`📊 汇总报告已保存: ${summaryPath}`);
    }
}

// 主执行函数
async function main() {
    const extractor = new EmbeddedCommentExtractor();
    
    try {
        await extractor.initialize();
        await extractor.processAllFiles();
        await extractor.generateSummary();
        
        console.log('\n🎉 嵌入式评论提取完成！');
        console.log(`📁 结果保存在: ${extractor.commentsDir}`);
        
    } catch (error) {
        console.error('❌ 执行失败:', error);
        process.exit(1);
    }
}

// 运行程序
if (require.main === module) {
    main();
}

module.exports = EmbeddedCommentExtractor;