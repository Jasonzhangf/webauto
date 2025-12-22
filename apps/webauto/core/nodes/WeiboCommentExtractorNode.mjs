/**
 * 微博评论提取节点
 * 提取帖子的所有评论，包括嵌套回复和多媒体内容
 */

import { BaseNode } from './base-node';
import fs from 'fs';
import path from 'path';

class WeiboCommentExtractorNode extends BaseNode {
  constructor(config = {}) {
    super('WEIBO_COMMENT_EXTRACTOR', config);

    this.defaultConfig = {
      maxComments: 1000,
      maxReplyDepth: 5,
      extractMedia: true,
      autoLoadMore: true,
      loadMoreDelay: 2000,
      maxLoadMoreAttempts: 10,
      timeout: 60000,
      selectors: {
        // 评论容器选择器
        commentContainer: '.Feed_body_3R0rO .Feed_body_comments, .Comment_container',
        commentList: '.Feed_body_3R0rO .Comment_list, .Comment_container_list',
        commentItem: '.Feed_body_3R0rO .Comment_item, .Comment_container_item',

        // 评论内容选择器
        commentAuthor: '.Comment_author, .Comment_item_author, [class*="author"]',
        commentContent: '.Comment_content, .Comment_item_content, [class*="content"]',
        commentTime: '.Comment_time, .Comment_item_time, [class*="time"]',
        commentLikes: '.Comment_likes, .Comment_item_likes, [class*="likes"]',
        commentReplies: '.Comment_replies, .Comment_item_replies, [class*="replies"]',

        // 回复容器选择器
        replyContainer: '.Comment_replies_container, .Comment_item_replies_container',
        replyItem: '.Comment_reply, .Comment_item_reply, [class*="reply"]',

        // 媒体内容选择器
        commentMedia: '.Comment_media, .Comment_item_media, [class*="media"]',
        commentImages: '.Comment_media img, .Comment_item_media img',
        commentVideos: '.Comment_media video, .Comment_item_media video',

        // 加载更多按钮
        loadMoreButton: '.Comment_more, .Feed_body_comments_more, [class*="more"], [data-action="load-more"]',
        loadMoreText: '加载更多,查看更多,展开更多'
      },
      ...config
    };

    this.config = { ...this.defaultConfig, ...config };
    this.extractionStats = {
      startTime: null,
      endTime: null,
      totalComments: 0,
      totalReplies: 0,
      mediaCount: 0,
      loadMoreAttempts: 0,
      errors: []
    };
  }

  async validateInput(input) {
    if (!input.page) {
      throw new Error('Missing required input: page');
    }

    if (!input.commentInfo) {
      throw new Error('Missing required input: commentInfo');
    }

    if (!input.commentInfo.hasComments) {
      console.log('帖子无评论，跳过评论提取');
      return false; // 允许跳过执行
    }

    return true;
  }

  async preprocess(input) {
    this.extractionStats.startTime = Date.now();

    // 确保评论区域已加载
    try {
      await input.page.waitForSelector(this.config.selectors.commentContainer, { timeout: 5000 });
      console.log('📝 评论区域已加载');
    } catch (error) {
      console.warn('评论区域加载超时，继续尝试提取');
    }

    return input;
  }

  async execute(input) {
    const { page, commentInfo } = input;

    console.log('🔍 开始提取评论数据...');

    try {
      // 加载更多评论（如果启用）
      if (this.config.autoLoadMore && commentInfo.hasMoreComments) {
        await this.loadMoreComments(page);
      }

      // 提取主评论
      const mainComments = await this.extractMainComments(page);

      // 提取回复（如果启用）
      let replies = [];
      if (this.config.maxReplyDepth > 0) {
        replies = await this.extractReplies(page, mainComments);
      }

      // 提取评论中的媒体内容（如果启用）
      let commentMedia = [];
      if (this.config.extractMedia) {
        commentMedia = await this.extractCommentMedia(page, mainComments, replies);
      }

      // 构建评论树结构
      const commentTree = this.buildCommentTree(mainComments, replies);

      // 生成提取统计
      this.extractionStats.endTime = Date.now();
      this.extractionStats.executionTime = this.extractionStats.endTime - this.extractionStats.startTime;
      this.extractionStats.totalComments = mainComments.length;
      this.extractionStats.totalReplies = replies.length;

      const result = {
        success: true,
        comments: mainComments,
        replies,
        commentTree,
        commentMedia,
        extractionStats: { ...this.extractionStats }
      };

      console.log(`✅ 评论提取完成 - ${mainComments.length} 条主评论, ${replies.length} 条回复, ${commentMedia.length} 个媒体文件`);
      console.log(`📊 提取统计: 执行时间 ${this.extractionStats.executionTime}ms, 加载尝试 ${this.extractionStats.loadMoreAttempts} 次`);

      return result;

    } catch (error) {
      this.extractionStats.errors.push({
        timestamp: Date.now(),
        error: error.message,
        stack: error.stack
      });

      throw new Error(`评论提取失败: ${error.message}`);
    }
  }

  async loadMoreComments(page) {
    console.log('🔄 开始加载更多评论...');

    let attempt = 0;
    let totalLoaded = 0;

    while (attempt < this.config.maxLoadMoreAttempts) {
      try {
        // 查找加载更多按钮
        const loadMoreButton = await page.$(this.config.selectors.loadMoreButton);
        if (!loadMoreButton) {
          console.log('没有找到加载更多按钮');
          break;
        }

        // 检查按钮文本
        const buttonText = await loadMoreButton.textContent();
        const loadMoreTexts = this.config.selectors.loadMoreText.split(',');
        const shouldClick = loadMoreTexts.some(text => buttonText.includes(text.trim()));

        if (!shouldClick) {
          console.log('按钮文本不符合加载更多条件:', buttonText);
          break;
        }

        // 检查评论数量是否已达到限制
        const currentComments = await page.$$eval(this.config.selectors.commentItem, elements => elements.length);
        if (currentComments >= this.config.maxComments) {
          console.log(`已达到最大评论数量限制: ${this.config.maxComments}`);
          break;
        }

        console.log(`点击加载更多按钮 (尝试 ${attempt + 1}/${this.config.maxLoadMoreAttempts})`);
        await loadMoreButton.click();

        // 等待新评论加载
        await page.waitForTimeout(this.config.loadMoreDelay);

        // 检查是否加载了新评论
        const newComments = await page.$$eval(this.config.selectors.commentItem, elements => elements.length);
        if (newComments === currentComments) {
          console.log('没有加载新评论，停止加载');
          break;
        }

        totalLoaded = newComments;
        console.log(`已加载 ${newComments} 条评论`);

        attempt++;

      } catch (error) {
        console.warn(`加载更多评论失败 (尝试 ${attempt + 1}):`, error.message);
        this.extractionStats.errors.push({
          timestamp: Date.now(),
          error: `加载更多失败: ${error.message}`
        });
        attempt++;
      }
    }

    this.extractionStats.loadMoreAttempts = attempt;
    console.log(`📝 总共加载了 ${totalLoaded} 条评论`);
  }

  async extractMainComments(page) {
    console.log('📝 提取主评论...');

    try {
      const commentItems = await page.$$(this.config.selectors.commentItem);
      const comments = [];

      for (let i = 0; i < Math.min(commentItems.length, this.config.maxComments); i++) {
        try {
          const comment = await this.extractSingleComment(page, commentItems[i], `comment_${i}`);
          if (comment && comment.content) {
            comments.push(comment);
          }
        } catch (error) {
          console.warn(`提取第 ${i + 1} 条评论失败:`, error.message);
          this.extractionStats.errors.push({
            timestamp: Date.now(),
            error: `主评论提取失败: ${error.message}`
          });
        }
      }

      console.log(`✅ 提取了 ${comments.length} 条主评论`);
      return comments;

    } catch (error) {
      console.error('提取主评论失败:', error);
      throw error;
    }
  }

  async extractSingleComment(page, commentElement, commentId) {
    try {
      // 在评论元素内查找内容
      const commentData = await page.evaluate((element, selectors, commentId) => {
        const findElementText = (parent, selector) => {
          const el = parent.querySelector(selector);
          return el ? el.textContent?.trim() : '';
        };

        const findElementAttribute = (parent, selector, attribute) => {
          const el = parent.querySelector(selector);
          return el ? el[attribute] : '';
        };

        // 提取作者信息
        const authorElement = element.querySelector(selectors.commentAuthor);
        const authorName = findElementText(element, selectors.commentAuthor);
        const authorId = findElementAttribute(authorElement, selectors.commentAuthor, 'data-user-id') ||
                        findElementAttribute(authorElement, selectors.commentAuthor, 'data-uid') ||
                        authorName;

        // 提取评论内容
        const content = findElementText(element, selectors.commentContent);

        // 提取时间
        const timeText = findElementText(element, selectors.commentTime);

        // 提取点赞数
        const likesText = findElementText(element, selectors.commentLikes);
        const likes = parseInt(likesText.match(/\d+/)?.[0] || '0') || 0;

        // 检查是否有回复
        const replyContainer = element.querySelector(selectors.replyContainer);
        const hasReplies = replyContainer !== null;
        const replyCount = hasReplies ?
          replyContainer.querySelectorAll(selectors.replyItem).length : 0;

        // 检查是否有媒体内容
        const mediaContainer = element.querySelector(selectors.commentMedia);
        const hasMedia = mediaContainer !== null;

        return {
          id: commentId,
          content: content || '',
          author: {
            name: authorName,
            id: authorId,
            verified: authorElement?.classList.contains('verified') || false
          },
          timestamp: timeText,
          statistics: {
            likes: likes,
            replies: replyCount
          },
          hasReplies,
          hasMedia,
          depth: 0,
          parentId: null
        };
      }, commentElement, this.config.selectors, commentId);

      return commentData;

    } catch (error) {
      console.error(`提取评论 ${commentId} 失败:`, error);
      return null;
    }
  }

  async extractReplies(page, mainComments) {
    console.log('🔄 提取回复评论...');

    const replies = [];

    for (let i = 0; i < mainComments.length; i++) {
      const comment = mainComments[i];
      if (!comment.hasReplies) {
        continue;
      }

      try {
        const commentReplies = await this.extractCommentReplies(page, comment, i);
        replies.push(...commentReplies);

        console.log(`💬 评论 ${i + 1} 有 ${commentReplies.length} 条回复`);
      } catch (error) {
        console.warn(`提取评论 ${i + 1} 的回复失败:`, error.message);
      }

      // 检查是否达到最大回复深度
      if (i >= 10) { // 限制处理的主评论数量，避免过于耗时
        console.log('已处理足够的主评论，停止提取回复');
        break;
      }
    }

    console.log(`✅ 提取了 ${replies.length} 条回复`);
    return replies;
  }

  async extractCommentReplies(page, parentComment, parentIndex) {
    try {
      // 找到父评论元素
      const commentElements = await page.$$(this.config.selectors.commentItem);
      if (parentIndex >= commentElements.length) {
        return [];
      }

      const parentElement = commentElements[parentIndex];

      // 在父评论内查找回复
      const replyElements = await parentElement.$$(this.config.selectors.replyItem);
      const replies = [];

      for (let i = 0; i < Math.min(replyElements.length, 50); i++) { // 限制每个评论的回复数量
        try {
          const reply = await this.extractSingleReply(page, replyElements[i], parentComment.id, `reply_${parentIndex}_${i}`);
          if (reply && reply.content) {
            replies.push(reply);
          }
        } catch (error) {
          console.warn(`提取回复 ${i + 1} 失败:`, error.message);
        }
      }

      return replies;

    } catch (error) {
      console.error(`提取评论 ${parentComment.id} 的回复失败:`, error);
      return [];
    }
  }

  async extractSingleReply(page, replyElement, parentId, replyId) {
    try {
      const replyData = await page.evaluate((element, selectors, parentId, replyId) => {
        const findElementText = (parent, selector) => {
          const el = parent.querySelector(selector);
          return el ? el.textContent?.trim() : '';
        };

        // 提取回复作者
        const authorName = findElementText(element, selectors.commentAuthor);

        // 提取回复内容
        const content = findElementText(element, selectors.commentContent);

        // 提取时间
        const timeText = findElementText(element, selectors.commentTime);

        // 提取点赞数
        const likesText = findElementText(element, selectors.commentLikes);
        const likes = parseInt(likesText.match(/\d+/)?.[0] || '0') || 0;

        return {
          id: replyId,
          parentId: parentId,
          content: content || '',
          author: {
            name: authorName,
            id: authorName,
            verified: false
          },
          timestamp: timeText,
          statistics: {
            likes: likes,
            replies: 0
          },
          hasReplies: false,
          hasMedia: false,
          depth: 1
        };
      }, replyElement, this.config.selectors, parentId, replyId);

      return replyData;

    } catch (error) {
      console.error(`提取回复 ${replyId} 失败:`, error);
      return null;
    }
  }

  async extractCommentMedia(page, comments, replies) {
    console.log('📸 提取评论中的媒体内容...');

    const allComments = [...comments, ...replies];
    const mediaFiles = [];

    for (let i = 0; i < Math.min(allComments.length, 100); i++) { // 限制处理的评论数量
      try {
        const commentMedia = await this.extractSingleCommentMedia(page, allComments[i], i);
        mediaFiles.push(...commentMedia);
      } catch (error) {
        console.warn(`提取评论 ${i + 1} 的媒体失败:`, error.message);
      }
    }

    this.extractionStats.mediaCount = mediaFiles.length;
    console.log(`✅ 提取了 ${mediaFiles.length} 个评论媒体文件`);

    return mediaFiles;
  }

  async extractSingleCommentMedia(page, comment, index) {
    try {
      // 这个方法需要根据实际情况实现，因为评论可能已经被处理过
      // 暂时返回空数组
      return [];
    } catch (error) {
      console.error(`提取评论 ${comment.id} 的媒体失败:`, error);
      return [];
    }
  }

  buildCommentTree(comments, replies) {
    console.log('🌳 构建评论树结构...');

    const tree = {
      totalComments: comments.length,
      totalReplies: replies.length,
      topLevelComments: comments.map(comment => ({
        ...comment,
        replies: []
      }))
    };

    // 将回复添加到对应的父评论中
    for (const reply of replies) {
      const parentComment = tree.topLevelComments.find(c => c.id === reply.parentId);
      if (parentComment) {
        parentComment.replies.push(reply);
      }
    }

    return tree;
  }

  async postprocess(output) {
    // 保存提取结果到临时文件用于调试
    if (process.env.NODE_ENV === 'development') {
      const debugPath = path.join(process.cwd(), 'debug', 'comment-extraction.json');
      const debugDir = path.dirname(debugPath);

      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      fs.writeFileSync(debugPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        output,
        stats: this.extractionStats
      }, null, 2));

      console.log(`📝 调试信息已保存到: ${debugPath}`);
    }

    return output;
  }

  async handleError(error) {
    console.error('评论提取节点错误:', error);

    this.extractionStats.errors.push({
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack
    });

    // 返回部分结果，而不是完全失败
    return {
      success: false,
      error: error.message,
      comments: [],
      replies: [],
      commentTree: { totalComments: 0, totalReplies: 0, topLevelComments: [] },
      commentMedia: [],
      extractionStats: { ...this.extractionStats }
    };
  }
}

export default WeiboCommentExtractorNode;