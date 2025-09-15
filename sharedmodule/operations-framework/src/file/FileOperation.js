/**
 * 文件操作子基类
 * 处理文件系统相关的所有操作
 */

import BaseOperation from "./BaseOperation.js"';
import { promises as fs } from 'fs';
import path from 'path';

export class FileOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.category = 'file';
    this.basePath = config.basePath || process.cwd();
    this.encoding = config.encoding || 'utf8';
    this.autoCreateDirs = config.autoCreateDirs ?? true;
  }

  /**
   * 解析文件路径
   */
  resolvePath(filePath) {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.basePath, filePath);
  }

  /**
   * 确保目录存在
   */
  async ensureDirectory(dirPath) {
    const resolvedPath = this.resolvePath(dirPath);
    
    try {
      await fs.mkdir(resolvedPath, { recursive: true });
      this.logger.debug('Directory ensured', { path: resolvedPath });
      return resolvedPath;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        this.logger.error('Failed to create directory', { path: resolvedPath, error: error.message });
        throw error;
      }
      return resolvedPath;
    }
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(filePath) {
    const resolvedPath = this.resolvePath(filePath);
    
    try {
      await fs.access(resolvedPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * 检查目录是否存在
   */
  async directoryExists(dirPath) {
    const resolvedPath = this.resolvePath(dirPath);
    
    try {
      const stats = await fs.stat(resolvedPath);
      return stats.isDirectory();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * 读取文件
   */
  async readFile(filePath, options = {}) {
    const resolvedPath = this.resolvePath(filePath);
    const readOptions = {
      encoding: options.encoding || this.encoding,
      flag: options.flag || 'r'
    };

    try {
      const content = await fs.readFile(resolvedPath, readOptions);
      this.logger.debug('File read successfully', { 
        path: resolvedPath, 
        size: content.length,
        encoding: readOptions.encoding 
      });
      return content;
    } catch (error) {
      this.logger.error('Failed to read file', { path: resolvedPath, error: error.message });
      throw error;
    }
  }

  /**
   * 写入文件
   */
  async writeFile(filePath, content, options = {}) {
    const resolvedPath = this.resolvePath(filePath);
    
    // 确保目录存在
    if (this.autoCreateDirs) {
      await this.ensureDirectory(path.dirname(resolvedPath));
    }

    const writeOptions = {
      encoding: options.encoding || this.encoding,
      flag: options.flag || 'w',
      mode: options.mode || 0o666
    };

    try {
      await fs.writeFile(resolvedPath, content, writeOptions);
      this.logger.debug('File written successfully', { 
        path: resolvedPath, 
        size: content.length,
        encoding: writeOptions.encoding 
      });
      return resolvedPath;
    } catch (error) {
      this.logger.error('Failed to write file', { path: resolvedPath, error: error.message });
      throw error;
    }
  }

  /**
   * 追加内容到文件
   */
  async appendFile(filePath, content, options = {}) {
    const resolvedPath = this.resolvePath(filePath);
    
    // 确保目录存在
    if (this.autoCreateDirs) {
      await this.ensureDirectory(path.dirname(resolvedPath));
    }

    const appendOptions = {
      encoding: options.encoding || this.encoding,
      flag: 'a',
      mode: options.mode || 0o666
    };

    try {
      await fs.appendFile(resolvedPath, content, appendOptions);
      this.logger.debug('Content appended to file', { 
        path: resolvedPath, 
        contentLength: content.length,
        encoding: appendOptions.encoding 
      });
      return resolvedPath;
    } catch (error) {
      this.logger.error('Failed to append to file', { path: resolvedPath, error: error.message });
      throw error;
    }
  }

  /**
   * 删除文件
   */
  async deleteFile(filePath) {
    const resolvedPath = this.resolvePath(filePath);

    try {
      await fs.unlink(resolvedPath);
      this.logger.debug('File deleted successfully', { path: resolvedPath });
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.warn('File not found for deletion', { path: resolvedPath });
        return false;
      }
      this.logger.error('Failed to delete file', { path: resolvedPath, error: error.message });
      throw error;
    }
  }

  /**
   * 复制文件
   */
  async copyFile(sourcePath, targetPath) {
    const resolvedSource = this.resolvePath(sourcePath);
    const resolvedTarget = this.resolvePath(targetPath);

    try {
      // 确保目标目录存在
      if (this.autoCreateDirs) {
        await this.ensureDirectory(path.dirname(resolvedTarget));
      }

      await fs.copyFile(resolvedSource, resolvedTarget);
      this.logger.debug('File copied successfully', { 
        source: resolvedSource, 
        target: resolvedTarget 
      });
      return resolvedTarget;
    } catch (error) {
      this.logger.error('Failed to copy file', { 
        source: resolvedSource, 
        target: resolvedTarget, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 移动文件
   */
  async moveFile(sourcePath, targetPath) {
    const resolvedSource = this.resolvePath(sourcePath);
    const resolvedTarget = this.resolvePath(targetPath);

    try {
      // 确保目标目录存在
      if (this.autoCreateDirs) {
        await this.ensureDirectory(path.dirname(resolvedTarget));
      }

      await fs.rename(resolvedSource, resolvedTarget);
      this.logger.debug('File moved successfully', { 
        source: resolvedSource, 
        target: resolvedTarget 
      });
      return resolvedTarget;
    } catch (error) {
      this.logger.error('Failed to move file', { 
        source: resolvedSource, 
        target: resolvedTarget, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 创建目录
   */
  async createDirectory(dirPath, options = {}) {
    const resolvedPath = this.resolvePath(dirPath);
    const mkdirOptions = {
      recursive: options.recursive ?? true,
      mode: options.mode || 0o777
    };

    try {
      await fs.mkdir(resolvedPath, mkdirOptions);
      this.logger.debug('Directory created successfully', { 
        path: resolvedPath, 
        mode: mkdirOptions.mode 
      });
      return resolvedPath;
    } catch (error) {
      if (error.code === 'EEXIST') {
        this.logger.warn('Directory already exists', { path: resolvedPath });
        return resolvedPath;
      }
      this.logger.error('Failed to create directory', { path: resolvedPath, error: error.message });
      throw error;
    }
  }

  /**
   * 列出目录内容
   */
  async listDirectory(dirPath, options = {}) {
    const resolvedPath = this.resolvePath(dirPath);
    const listOptions = {
      withFileTypes: options.withFileTypes ?? true,
      recursive: options.recursive ?? false
    };

    try {
      const entries = await fs.readdir(resolvedPath, listOptions);
      
      if (listOptions.withFileTypes) {
        const result = await Promise.all(entries.map(async entry => ({
          name: entry.name,
          path: path.join(resolvedPath, entry.name),
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          size: entry.isFile() ? (await fs.stat(path.join(resolvedPath, entry.name))).size : null
        })));
        
        this.logger.debug('Directory listed successfully', { 
          path: resolvedPath, 
          count: result.length 
        });
        return result;
      } else {
        this.logger.debug('Directory listed successfully', { 
          path: resolvedPath, 
          count: entries.length 
        });
        return entries;
      }
    } catch (error) {
      this.logger.error('Failed to list directory', { path: resolvedPath, error: error.message });
      throw error;
    }
  }

  /**
   * 删除目录
   */
  async deleteDirectory(dirPath, options = {}) {
    const resolvedPath = this.resolvePath(dirPath);
    const deleteOptions = {
      recursive: options.recursive ?? true,
      force: options.force ?? true
    };

    try {
      await fs.rmdir(resolvedPath, deleteOptions);
      this.logger.debug('Directory deleted successfully', { path: resolvedPath });
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.warn('Directory not found for deletion', { path: resolvedPath });
        return false;
      }
      this.logger.error('Failed to delete directory', { path: resolvedPath, error: error.message });
      throw error;
    }
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(filePath) {
    const resolvedPath = this.resolvePath(filePath);

    try {
      const stats = await fs.stat(resolvedPath);
      return {
        path: resolvedPath,
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        accessedAt: stats.atime,
        mode: stats.mode
      };
    } catch (error) {
      this.logger.error('Failed to get file info', { path: resolvedPath, error: error.message });
      throw error;
    }
  }

  /**
   * 读取JSON文件
   */
  async readJSON(filePath) {
    const content = await this.readFile(filePath, { encoding: 'utf8' });
    try {
      return JSON.parse(content);
    } catch (error) {
      this.logger.error('Failed to parse JSON', { path: filePath, error: error.message });
      throw new Error(`Invalid JSON in file ${filePath}: ${error.message}`);
    }
  }

  /**
   * 写入JSON文件
   */
  async writeJSON(filePath, data, options = {}) {
    const jsonString = JSON.stringify(data, null, options.indent || 2);
    return await this.writeFile(filePath, jsonString, { 
      encoding: 'utf8', 
      ...options 
    });
  }

  /**
   * 获取文件大小
   */
  async getFileSize(filePath) {
    const info = await this.getFileInfo(filePath);
    return info.size;
  }

  /**
   * 检查文件权限
   */
  async checkPermissions(filePath) {
    const resolvedPath = this.resolvePath(filePath);
    
    try {
      await fs.access(resolvedPath, fs.constants.R_OK | fs.constants.W_OK);
      return { readable: true, writable: true };
    } catch (error) {
      const permissions = { readable: false, writable: false };
      
      try {
        await fs.access(resolvedPath, fs.constants.R_OK);
        permissions.readable = true;
      } catch (e) {
        // 忽略读取权限错误
      }
      
      try {
        await fs.access(resolvedPath, fs.constants.W_OK);
        permissions.writable = true;
      } catch (e) {
        // 忽略写入权限错误
      }
      
      return permissions;
    }
  }

  /**
   * 获取操作子状态
   */
  getStatus() {
    return {
      basePath: this.basePath,
      encoding: this.encoding,
      autoCreateDirs: this.autoCreateDirs,
      category: this.category
    };
  }
}

export default FileOperation;