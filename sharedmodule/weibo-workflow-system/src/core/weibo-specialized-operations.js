/**
 * 微博专项原子操作子库
 * 专门用于复杂微博帖子的内容捕获和评论提取
 */

// === 微博帖子内容捕获操作 ===

/**
 * 微博帖子完整内容捕获操作
 * 捕获文字、图片、视频链接、作者信息、发布时间等
 */
class WeiboPostContentCaptureOperation {
  constructor(config) {
    this.postUrl = config.postUrl;
    this.contentSelectors = config.contentSelectors || {
      mainContent: '.Feed_body_3R0rO, .Feed_body_2wP8c, .feed_body, [class*="feed_body"]',
      authorName: '.Feed_body_3R0rO .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.woo-box-alignCenter.Z_link_isY_0, .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.woo-box-alignCenter.Z_link_isY_0, .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.woo-box-alignCenter.Z_link_isY_0',
      postTime: '.Feed_body_3R0rO .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.Card_title_3NffA, .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.Card_title_3NffA, .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.Card_title_3NffA',
      images: 'img[class*="image"], img[src*="sinaimg"], .Feed_body_3R0rO img, .Feed_body_2wP8c img, .feed_img img',
      videos: 'video, .video-player, [class*="video"], a[href*="video"], a[href*="mp4"]',
      stats: '.Feed_body_3R0rO .woo-box-flex.woo-box-alignCenter.Card_actionBar_3P2T5, .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_actionBar_3P2T5, .woo-box-flex.woo-box-alignCenter.Card_actionBar_3P2T5'
    };
    this.timeout = config.timeout || 15000;
  }

  async execute(page) {
    try {
      const result = {
        url: this.postUrl,
        content: {},
        media: [],
        metadata: {},
        capturedAt: new Date().toISOString()
      };

      // 导航到帖子页面
      if (this.postUrl) {
        await page.goto(this.postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000); // 等待动态内容加载
      }

      // 捕获主内容
      const mainContent = await page.evaluate((selectors) => {
        const mainElement = document.querySelector(selectors.mainContent);
        if (!mainElement) return null;

        // 提取纯文本内容
        const textContent = mainElement.textContent || '';
        
        // 提取HTML内容（保留结构）
        const htmlContent = mainElement.innerHTML || '';

        return {
          text: textContent.trim(),
          html: htmlContent,
          elementCount: mainElement.querySelectorAll('*').length
        };
      }, this.contentSelectors);

      result.content = mainContent;

      // 捕获作者信息
      const authorInfo = await page.evaluate((selectors) => {
        const authorElement = document.querySelector(selectors.authorName);
        const timeElement = document.querySelector(selectors.postTime);
        
        return {
          name: authorElement ? authorElement.textContent.trim() : null,
          time: timeElement ? timeElement.textContent.trim() : null,
          profileUrl: authorElement ? authorElement.href : null
        };
      }, this.contentSelectors);

      result.metadata.author = authorInfo;

      // 捕获图片
      const images = await page.evaluate((selectors) => {
        const imageElements = document.querySelectorAll(selectors.images);
        return Array.from(imageElements).map(img => ({
          src: img.src || img.dataset.src,
          alt: img.alt || '',
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          isLazy: !!img.dataset.src
        })).filter(img => img.src && (img.src.includes('sinaimg') || img.src.includes('weibo')));
      }, this.contentSelectors);

      result.media = result.media.concat(images.map(img => ({ ...img, type: 'image' })));

      // 捕获视频链接
      const videos = await page.evaluate((selectors) => {
        const videoElements = document.querySelectorAll(selectors.videos);
        return Array.from(videoElements).map(element => {
          if (element.tagName === 'VIDEO') {
            return {
              src: element.src || element.currentSrc,
              poster: element.poster,
              duration: element.duration,
              type: 'video'
            };
          } else if (element.tagName === 'A') {
            return {
              url: element.href,
              text: element.textContent,
              type: 'video_link'
            };
          } else {
            return {
              src: element.querySelector('video')?.src || element.querySelector('a')?.href,
              type: 'video_embed'
            };
          }
        }).filter(v => v.src || v.url);
      }, this.contentSelectors);

      result.media = result.media.concat(videos);

      // 捕获统计数据（转发、评论、点赞）
      const stats = await page.evaluate((selectors) => {
        const statsElement = document.querySelector(selectors.stats);
        if (!statsElement) return null;

        const statItems = statsElement.querySelectorAll('button, a, [role="button"]');
        return Array.from(statItems).map(item => ({
          action: item.getAttribute('aria-label') || item.textContent,
          count: item.textContent.match(/\d+/)?.[0] || '0'
        }));
      }, this.contentSelectors);

      result.metadata.stats = stats;

      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 微博评论分页加载操作
 * 处理评论的分页加载和滚动加载
 */
class WeiboCommentsPaginationOperation {
  constructor(config) {
    this.maxComments = config.maxComments || 100;
    this.maxScrolls = config.maxScrolls || 20;
    this.scrollDelay = config.scrollDelay || 2000;
    this.commentContainer = config.commentContainer || '.Feed_body_3R0rO, .Feed_body_2wP8c, [class*="comment"], .comment_list, [class*="comment"]';
    this.loadMoreButton = config.loadMoreButton || 'button:has-text("加载更多"), [class*="more"], a:has-text("更多评论")';
    this.timeout = config.timeout || 30000;
  }

  async execute(page) {
    try {
      let allComments = [];
      let scrollCount = 0;
      let previousHeight = 0;

      console.log(`开始加载评论，目标: ${this.maxComments} 条评论`);

      // 初始等待
      await page.waitForTimeout(2000);

      while (scrollCount < this.maxScrolls && allComments.length < this.maxComments) {
        // 尝试点击"加载更多"按钮
        try {
          const loadMoreButton = await page.$(this.loadMoreButton);
          if (loadMoreButton) {
            await loadMoreButton.click();
            await page.waitForTimeout(this.scrollDelay);
          }
        } catch (error) {
          // 没有加载更多按钮，继续滚动
        }

        // 滚动页面加载更多评论
        await page.evaluate(() => {
          window.scrollBy(0, Math.min(1000, document.body.scrollHeight - window.scrollY));
        });

        await page.waitForTimeout(this.scrollDelay);

        // 检查页面高度是否变化
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === previousHeight) {
          // 页面高度没有变化，可能已经加载完所有评论
          break;
        }
        previousHeight = currentHeight;

        // 提取当前页面的评论
        const newComments = await this.extractCurrentPageComments(page);
        allComments.push(...newComments);

        console.log(`第 ${scrollCount + 1} 次滚动，已获取 ${allComments.length} 条评论`);

        scrollCount++;
      }

      // 去重
      const uniqueComments = this.deduplicateComments(allComments);

      return { 
        success: true, 
        result: {
          comments: uniqueComments.slice(0, this.maxComments),
          totalCount: uniqueComments.length,
          scrollCount: scrollCount,
          maxCommentsReached: uniqueComments.length >= this.maxComments
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async extractCurrentPageComments(page) {
    return await page.evaluate(() => {
      const commentElements = document.querySelectorAll('.Feed_body_3R0rO, .Feed_body_2wP8c, [class*="comment"], .comment_item, [class*="comment"]');
      
      return Array.from(commentElements).map(element => {
        // 尝试提取用户名
        const userElement = element.querySelector('.woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.woo-box-alignCenter.Z_link_isY_0, [class*="name"], [class*="user"]');
        const userName = userElement ? userElement.textContent.trim() : '';
        
        // 尝试提取评论内容
        const contentElement = element.querySelector('.Feed_body_3R0rO, .Feed_body_2wP8c, [class*="content"], [class*="text"]');
        const content = contentElement ? contentElement.textContent.trim() : '';
        
        // 尝试提取时间
        const timeElement = element.querySelector('.Feed_body_2wP8c, [class*="time"], [class*="date"]');
        const time = timeElement ? timeElement.textContent.trim() : '';
        
        // 尝试提取点赞数
        const likeElement = element.querySelector('button:has-text("赞"), [aria-label*="赞"], [class*="like"]');
        const likes = likeElement ? likeElement.textContent.match(/\d+/)?.[0] || '0' : '0';

        // 创建唯一标识符
        const id = `${userName}-${content}-${time}`.replace(/\s+/g, '_');

        return {
          id,
          userName,
          content,
          time,
          likes: parseInt(likes) || 0,
          element: element.outerHTML.substring(0, 200) // 保存部分HTML用于调试
        };
      }).filter(comment => comment.content.length > 0); // 过滤空评论
    });
  }

  deduplicateComments(comments) {
    const seen = new Set();
    return comments.filter(comment => {
      const key = `${comment.userName}-${comment.content}-${comment.time}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

/**
 * 微博帖子完整捕获操作
 * 整合内容捕获和评论捕获
 */
class WeiboPostCompleteCaptureOperation {
  constructor(config) {
    this.postUrl = config.postUrl;
    this.contentCapture = new WeiboPostContentCaptureOperation(config);
    this.commentsCapture = new WeiboCommentsPaginationOperation(config);
    this.savePath = config.savePath;
  }

  async execute(page) {
    try {
      console.log(`开始完整捕获微博帖子: ${this.postUrl}`);

      // 1. 捕获帖子内容
      console.log('步骤1: 捕获帖子内容...');
      const contentResult = await this.contentCapture.execute(page);
      if (!contentResult.success) {
        throw new Error(`内容捕获失败: ${contentResult.error}`);
      }

      // 2. 捕获评论
      console.log('步骤2: 捕获评论...');
      const commentsResult = await this.commentsCapture.execute(page);
      if (!commentsResult.success) {
        throw new Error(`评论捕获失败: ${commentsResult.error}`);
      }

      // 3. 整合结果
      const completeResult = {
        post: contentResult.result,
        comments: commentsResult.result,
        summary: {
          totalComments: commentsResult.result.totalCount,
          totalImages: contentResult.result.media.filter(m => m.type === 'image').length,
          totalVideos: contentResult.result.media.filter(m => m.type === 'video' || m.type === 'video_link').length,
          capturedAt: new Date().toISOString()
        }
      };

      // 4. 保存结果
      if (this.savePath) {
        await this.saveResults(completeResult, this.savePath);
      }

      console.log(`✅ 完整捕获完成: ${completeResult.summary.totalComments} 条评论, ${completeResult.summary.totalImages} 张图片, ${completeResult.summary.totalVideos} 个视频`);

      return { success: true, result: completeResult };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async saveResults(results, filePath) {
    const fs = await import('fs');
    const fsPromises = await import('fs').then(m => m.promises);
    
    // 确保目录存在
    const dir = require('path').dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
    
    await fsPromises.writeFile(filePath, JSON.stringify(results, null, 2));
    console.log(`💾 结果已保存到: ${filePath}`);
  }
}

// === 导出 ===

export {
  WeiboPostContentCaptureOperation,
  WeiboCommentsPaginationOperation,
  WeiboPostCompleteCaptureOperation
};

// 如果需要在其他地方使用，也可以添加到工厂类中
export const WeiboSpecializedOperations = {
  'weibo.post.content': WeiboPostContentCaptureOperation,
  'weibo.comments.pagination': WeiboCommentsPaginationOperation,
  'weibo.post.complete': WeiboPostCompleteCaptureOperation
};