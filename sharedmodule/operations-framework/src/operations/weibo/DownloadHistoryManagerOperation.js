/**
 * 下载历史管理操作子
 * 管理下载历史记录，支持文件删除时同步清理历史记录
 */

import { BaseOperation } from '../core/BaseOperation.js';
import { readFile, writeFile, exists, access, rm, readdir } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';

export class DownloadHistoryManagerOperation extends BaseOperation {
  constructor(config = {}) {
    super('download-history-manager', config);
    this.category = 'history-management';
    this.supportedContainers = ['weibo-batch', 'weibo-single'];
    this.capabilities = ['history-management', 'file-cleanup', 'record-sync'];
  }

  async execute(context = {}) {
    this.logger.info('开始下载历史管理...');

    try {
      const { action, postId, folderName, baseDir } = context;

      switch (action) {
        case 'check':
          return await this.checkPostDownloaded(postId, folderName, baseDir);
        case 'record':
          return await this.recordDownload(context);
        case 'delete':
          return await this.deletePostRecord(postId, folderName, baseDir);
        case 'cleanup':
          return await this.cleanupOrphanedRecords(baseDir);
        case 'list':
          return await this.listDownloadedPosts(folderName, baseDir);
        default:
          throw new Error(`未知操作: ${action}`);
      }

    } catch (error) {
      this.logger.error('下载历史管理失败:', error);
      throw error;
    }
  }

  // 检查帖子是否已下载
  async checkPostDownloaded(postId, folderName, baseDir) {
    if (!postId || !folderName) {
      throw new Error('postId和folderName不能为空');
    }

    const historyFile = this.getHistoryFilePath(folderName, baseDir);

    if (!await exists(historyFile)) {
      return { downloaded: false, reason: '历史记录文件不存在' };
    }

    try {
      const content = await readFile(historyFile, 'utf8');
      const history = JSON.parse(content);

      if (!history[postId]) {
        return { downloaded: false, reason: '历史记录中不存在' };
      }

      // 检查文件是否还存在
      const record = history[postId];
      const postDir = record.postDir;

      // 检查主要文件是否存在
      const mainFiles = ['post-data.json', 'post-content.md'];
      for (const file of mainFiles) {
        const filePath = join(postDir, file);
        if (!await exists(filePath)) {
          // 文件不存在，清理历史记录
          delete history[postId];
          await writeFile(historyFile, JSON.stringify(history, null, 2));
          this.logger.info(`清理缺失文件的历史记录: ${postId}`);
          return { downloaded: false, reason: `文件 ${file} 不存在` };
        }
      }

      return { downloaded: true, record };

    } catch (error) {
      this.logger.warn('检查下载状态失败:', error.message);
      return { downloaded: false, reason: '检查失败' };
    }
  }

  // 记录下载历史
  async recordDownload(context) {
    const {
      postId,
      url,
      folderName,
      postDir,
      downloadType,
      keyword,
      username,
      downloadedAt,
      content,
      images,
      comments
    } = context;

    if (!postId || !folderName || !postDir) {
      throw new Error('postId、folderName和postDir不能为空');
    }

    const historyFile = this.getHistoryFilePath(folderName);
    let history = {};

    // 读取现有历史记录
    if (await exists(historyFile)) {
      try {
        const content = await readFile(historyFile, 'utf8');
        history = JSON.parse(content);
      } catch (error) {
        this.logger.warn('读取历史记录失败:', error.message);
      }
    }

    // 生成文件列表
    const files = await this.generateFileList(postDir);

    // 更新历史记录
    history[postId] = {
      postId,
      url,
      folderName,
      postDir,
      downloadType,
      keyword,
      username,
      downloadedAt,
      files,
      stats: {
        images: images || 0,
        comments: comments || 0,
        contentLength: content?.content?.length || 0,
        fileCount: files.length
      }
    };

    // 保存历史记录
    await writeFile(historyFile, JSON.stringify(history, null, 2));
    this.logger.info(`记录下载历史: ${postId} (${files.length} 个文件)`);

    return { success: true, postId, fileCount: files.length };
  }

  // 删除帖子记录及相关文件
  async deletePostRecord(postId, folderName, baseDir) {
    if (!postId || !folderName) {
      throw new Error('postId和folderName不能为空');
    }

    const postDir = this.getPostDirPath(postId, folderName, baseDir);
    const historyFile = this.getHistoryFilePath(folderName, baseDir);

    let deletedFiles = 0;
    let deletedHistory = false;

    try {
      // 1. 删除帖子目录
      if (await exists(postDir)) {
        const files = await this.generateFileList(postDir);
        await rm(postDir, { recursive: true, force: true });
        deletedFiles = files.length;
        this.logger.info(`删除帖子目录: ${postDir} (${deletedFiles} 个文件)`);
      }

      // 2. 从历史记录中删除
      if (await exists(historyFile)) {
        try {
          const content = await readFile(historyFile, 'utf8');
          const history = JSON.parse(content);

          if (history[postId]) {
            delete history[postId];
            deletedHistory = true;

            // 如果历史记录为空，删除历史文件
            if (Object.keys(history).length === 0) {
              await rm(historyFile, { force: true });
              this.logger.info(`删除空历史记录文件: ${historyFile}`);
            } else {
              await writeFile(historyFile, JSON.stringify(history, null, 2));
              this.logger.info(`从历史记录中删除: ${postId}`);
            }
          }
        } catch (error) {
          this.logger.warn('更新历史记录失败:', error.message);
        }
      }

      return {
        success: true,
        postId,
        deletedFiles,
        deletedHistory,
        message: `删除完成 (文件: ${deletedFiles}, 历史记录: ${deletedHistory})`
      };

    } catch (error) {
      this.logger.error(`删除帖子记录失败: ${postId}`, error);
      throw error;
    }
  }

  // 清理孤立的历史记录（文件不存在但历史记录存在）
  async cleanupOrphanedRecords(baseDir) {
    const baseDirectory = baseDir || this.config.baseDir || join(homedir(), '.webauto/weibo-posts');
    let cleanedCount = 0;

    try {
      const folders = await readdir(baseDirectory);

      for (const folderName of folders) {
        const folderPath = join(baseDirectory, folderName);
        const historyFile = this.getHistoryFilePath(folderName, baseDirectory);

        if (await exists(historyFile)) {
          try {
            const content = await readFile(historyFile, 'utf8');
            const history = JSON.parse(content);

            let hasChanges = false;

            // 检查每个历史记录
            for (const [postId, record] of Object.entries(history)) {
              if (!await exists(record.postDir)) {
                delete history[postId];
                hasChanges = true;
                cleanedCount++;
                this.logger.info(`清理孤立历史记录: ${postId}`);
              }
            }

            // 如果有删除，保存更新后的历史记录
            if (hasChanges) {
              if (Object.keys(history).length === 0) {
                await rm(historyFile, { force: true });
                this.logger.info(`删除空历史记录文件: ${historyFile}`);
              } else {
                await writeFile(historyFile, JSON.stringify(history, null, 2));
              }
            }
          } catch (error) {
            this.logger.warn(`清理历史记录失败 ${folderName}:`, error.message);
          }
        }
      }

      this.logger.info(`清理完成，共清理 ${cleanedCount} 条孤立记录`);
      return { success: true, cleanedCount };

    } catch (error) {
      this.logger.error('清理孤立记录失败:', error);
      throw error;
    }
  }

  // 列出已下载的帖子
  async listDownloadedPosts(folderName, baseDir) {
    const historyFile = this.getHistoryFilePath(folderName, baseDir);

    if (!await exists(historyFile)) {
      return { posts: [], totalCount: 0, folderName };
    }

    try {
      const content = await readFile(historyFile, 'utf8');
      const history = JSON.parse(content);

      const posts = Object.values(history).map(record => ({
        postId: record.postId,
        url: record.url,
        downloadedAt: record.downloadedAt,
        stats: record.stats,
        files: record.files
      }));

      return {
        posts,
        totalCount: posts.length,
        folderName,
        historyFile
      };

    } catch (error) {
      this.logger.error('列出下载帖子失败:', error);
      throw error;
    }
  }

  // 获取历史记录文件路径
  getHistoryFilePath(folderName, baseDir) {
    const directory = baseDir || this.config.baseDir || join(homedir(), '.webauto/weibo-posts');
    return join(directory, folderName, 'download-history.json');
  }

  // 获取帖子目录路径
  getPostDirPath(postId, folderName, baseDir) {
    const directory = baseDir || this.config.baseDir || join(homedir(), '.webauto/weibo-posts');
    return join(directory, folderName, postId);
  }

  // 生成文件列表
  async generateFileList(directory) {
    if (!await exists(directory)) {
      return [];
    }

    try {
      const files = [];
      const items = await readdir(directory, { withFileTypes: true });

      for (const item of items) {
        if (item.isFile()) {
          files.push(item.name);
        } else if (item.isDirectory()) {
          // 递归获取子目录文件
          const subFiles = await this.generateFileList(join(directory, item.name));
          files.push(...subFiles.map(file => `${item.name}/${file}`));
        }
      }

      return files;
    } catch (error) {
      this.logger.warn(`生成文件列表失败 ${directory}:`, error.message);
      return [];
    }
  }

  // 同步多个文件夹的历史记录
  async syncMultipleFolders(folderNames, baseDir) {
    const results = {};

    for (const folderName of folderNames) {
      try {
        const result = await this.cleanupOrphanedRecords(baseDir);
        results[folderName] = result;
      } catch (error) {
        this.logger.error(`同步文件夹失败 ${folderName}:`, error);
        results[folderName] = { error: error.message };
      }
    }

    return results;
  }

  // 获取下载统计信息
  async getDownloadStatistics(folderNames, baseDir) {
    const stats = {
      totalFolders: folderNames.length,
      totalPosts: 0,
      totalFiles: 0,
      totalImages: 0,
      totalComments: 0,
      folderStats: {}
    };

    for (const folderName of folderNames) {
      try {
        const result = await this.listDownloadedPosts(folderName, baseDir);

        stats.totalPosts += result.totalCount;

        const folderStats = {
          postCount: result.totalCount,
          files: 0,
          images: 0,
          comments: 0
        };

        result.posts.forEach(post => {
          folderStats.files += post.stats.fileCount || 0;
          folderStats.images += post.stats.images || 0;
          folderStats.comments += post.stats.comments || 0;
        });

        stats.totalFiles += folderStats.files;
        stats.totalImages += folderStats.images;
        stats.totalComments += folderStats.comments;
        stats.folderStats[folderName] = folderStats;

      } catch (error) {
        this.logger.warn(`获取统计信息失败 ${folderName}:`, error.message);
      }
    }

    return stats;
  }

  async validate() {
    const errors = [];

    if (!this.config.baseDir) {
      // 使用默认目录，不算错误
    }

    return errors;
  }

  async cleanup() {
    this.logger.info('清理下载历史管理资源...');
  }
}

export default DownloadHistoryManagerOperation;