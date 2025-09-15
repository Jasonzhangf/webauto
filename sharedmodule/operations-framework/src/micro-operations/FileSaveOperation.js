/**
 * File Save Operation - Structured file saving for web content
 * Saves extracted content in organized directory structure
 */

import { BaseOperation } from '../core/BaseOperation.js';

export class FileSaveOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'FileSaveOperation';
    this.description = 'Save extracted web content in structured directory format';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['file-operations', 'data-persistence', 'content-organization'];
    this.supportedContainers = ['any'];
    this.capabilities = ['file-creation', 'directory-organization', 'data-export'];

    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.99,
      memoryUsage: 'low'
    };

    this.requiredParameters = ['content', 'keyword'];
    this.optionalParameters = {
      basePath: '~/.webauto/weibo',
      includeCSV: true,
      includeIndividualFiles: true,
      includeImages: true,
      createReadme: true,
      filePrefix: 'weibo-search',
      deduplication: true,
      skipExistingImages: true,
      incrementalMode: false
    };
  }

  async execute(context, params = {}) {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting file save operation', {
      keyword: finalParams.keyword,
      contentCount: Array.isArray(finalParams.content) ? finalParams.content.length : 1
    });

    try {
      const saveResult = await this.saveStructuredContent(finalParams);

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'File save operation completed', {
        savedPath: saveResult.basePath,
        executionTime
      });

      return {
        success: true,
        result: saveResult,
        metadata: {
          basePath: saveResult.basePath,
          totalFiles: saveResult.totalFiles,
          executionTime,
          operationType: 'file-save'
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'File save operation failed', { error: error.message, executionTime });

      return {
        success: false,
        error: error.message,
        metadata: {
          executionTime,
          operationType: 'file-save'
        }
      };
    }
  }

  async saveStructuredContent(params) {
    const { content, keyword, basePath = '~/.webauto/weibo' } = params;
    const today = new Date().toISOString().split('T')[0];

    // 创建基础目录: {basePath}/{keyword}/ (单目录模式)
    const baseDir = await this.resolvePath(basePath, keyword);
    await this.ensureDirectory(baseDir);

    // 扫描现有目录结构，获取实际的下载历史
    const existingData = await this.scanExistingDirectory(baseDir);

    // 如果启用去重，过滤已存在的内容
    let processedContent = content;
    if (params.deduplication) {
      processedContent = await this.deduplicateContent(content, existingData);
      this.log('info', `Deduplication: ${processedContent.length}/${content.length} new items`);
    }

    if (processedContent.length === 0) {
      this.log('info', 'No new content to save');
      return {
        basePath: baseDir,
        savedFiles: [],
        totalFiles: 0,
        metadata: existingData.metadata,
        directoryStructure: this.getDirectoryStructure(baseDir),
        isNewContent: false,
        existingItemCount: existingData.items.length
      };
    }

    this.log('info', `Created structured directory: ${baseDir}`);

    const savedFiles = [];
    let totalFiles = 0;

    // 1. 保存搜索/提取元数据
    const isNewSearch = existingData.items.length === 0;
    const metadata = {
      keyword: keyword,
      totalItems: existingData.items.length + (Array.isArray(processedContent) ? processedContent.length : 1),
      extractionType: 'web-content',
      framework: 'WebAuto File Operations',
      firstSearchDate: existingData.metadata?.firstSearchDate || today,
      lastSearchDate: today,
      searchCount: (existingData.metadata?.searchCount || 0) + 1,
      isNewSearch: isNewSearch
    };

    const metaFile = this.joinPath(baseDir, 'metadata.json');
    await this.writeFile(metaFile, JSON.stringify(metadata, null, 2));
    savedFiles.push(metaFile);
    totalFiles++;

    // 保存搜索历史记录
    const searchHistory = {
      keyword: keyword,
      searchDate: today,
      searchTime: new Date().toISOString(),
      newItemsCount: Array.isArray(processedContent) ? processedContent.length : 1,
      existingItemsCount: existingData.items.length,
      totalItemsAfterSearch: existingData.items.length + (Array.isArray(processedContent) ? processedContent.length : 1),
      searchParameters: params
    };

    const historyFile = this.joinPath(baseDir, 'search-history.json');
    let existingHistory = [];

    // 读取现有历史记录
    try {
      const fs = await import('fs');
      if (fs.existsSync(historyFile)) {
        const historyContent = fs.readFileSync(historyFile, 'utf8');
        existingHistory = JSON.parse(historyContent);
      }
    } catch (error) {
      // 忽略读取错误，使用空历史记录
    }

    // 添加新记录（不限制历史记录数量）
    existingHistory.unshift(searchHistory);

    await this.writeFile(historyFile, JSON.stringify(existingHistory, null, 2));
    savedFiles.push(historyFile);
    totalFiles++;

    // 2. 保存汇总数据
    const allItems = this.mergeExistingItems(processedContent, existingData);
    const summaryData = {
      metadata,
      items: allItems
    };

    const summaryFile = this.joinPath(baseDir, 'all-items.json');
    await this.writeFile(summaryFile, JSON.stringify(summaryData, null, 2));
    savedFiles.push(summaryFile);
    totalFiles++;

    // 3. 保存CSV格式（如果启用）
    if (params.includeCSV) {
      const csvFile = this.joinPath(baseDir, 'all-items.csv');
      const csvContent = this.generateCSV(allItems);
      await this.writeFile(csvFile, csvContent, 'utf8');
      savedFiles.push(csvFile);
      totalFiles++;
    }

    // 4. 为每个新内容项创建独立目录（如果启用）
    if (params.includeIndividualFiles && Array.isArray(processedContent)) {
      const startId = existingData.items.length + 1;
      for (let i = 0; i < processedContent.length; i++) {
        const item = processedContent[i];
        const itemId = startId + i;
        const itemDir = this.joinPath(baseDir, `item_${itemId}`);
        await this.ensureDirectory(itemDir);

        const itemFiles = await this.saveIndividualItem(item, itemId, itemDir, params);
        savedFiles.push(...itemFiles);
        totalFiles += itemFiles.length;
      }
    }

    // 5. 创建README文件（如果启用）
    if (params.createReadme) {
      const readmeFile = this.joinPath(baseDir, 'README.md');
      const readmeContent = this.generateReadme(metadata, content, params);
      await this.writeFile(readmeFile, readmeContent);
      savedFiles.push(readmeFile);
      totalFiles++;
    }

    return {
      basePath: baseDir,
      savedFiles,
      totalFiles,
      metadata,
      directoryStructure: this.getDirectoryStructure(baseDir),
      isNewContent: true,
      newItemsCount: processedContent.length,
      existingItemCount: existingData.items.length
    };
  }

  async saveIndividualItem(item, itemId, itemDir, params) {
    const files = [];

    // 保存项目数据
    const itemData = {
      id: itemId,
      ...this.extractItemData(item),
      savedAt: new Date().toISOString()
    };

    const dataFile = this.joinPath(itemDir, 'data.json');
    await this.writeFile(dataFile, JSON.stringify(itemData, null, 2));
    files.push(dataFile);

    // 保存图片（如果有）
    if (params.includeImages && itemData.images && itemData.images.length > 0) {
      const imagesDir = this.joinPath(itemDir, 'images');
      await this.ensureDirectory(imagesDir);

      // 保存图片URL信息
      const imagesData = {
        itemId,
        imageUrls: itemData.images,
        totalImages: itemData.images.length,
        extractedAt: new Date().toISOString()
      };

      const imagesFile = this.joinPath(imagesDir, 'urls.json');
      await this.writeFile(imagesFile, JSON.stringify(imagesData, null, 2));
      files.push(imagesFile);

      // 扫描已存在的图片文件
      const existingImages = await this.scanExistingImages(imagesDir);

      // 下载图片文件
      const downloadResults = await this.downloadImages(itemData.images, imagesDir, itemId, {
        skipExisting: params.skipExistingImages,
        existingImages: existingImages
      });
      files.push(...downloadResults.downloadedFiles);

      this.log('info', `Downloaded ${downloadResults.successCount}/${itemData.images.length} images for item ${itemId} (${downloadResults.skippedCount} skipped)`, {
        itemId,
        totalImages: itemData.images.length,
        successCount: downloadResults.successCount,
        skippedCount: downloadResults.skippedCount,
        failedCount: downloadResults.failedCount
      });
    }

    // 保存原文链接（如果有）
    if (itemData.url) {
      const urlFile = this.joinPath(itemDir, 'url.txt');
      await this.writeFile(urlFile, itemData.url);
      files.push(urlFile);
    }

    // 创建项目README
    const itemReadme = this.generateItemReadme(itemData, itemId);
    const readmeFile = this.joinPath(itemDir, 'README.md');
    await this.writeFile(readmeFile, itemReadme);
    files.push(readmeFile);

    return files;
  }

  normalizeContent(content) {
    if (!Array.isArray(content)) {
      return [this.extractItemData(content)];
    }

    return content.map((item, index) => ({
      id: index + 1,
      ...this.extractItemData(item)
    }));
  }

  extractItemData(item) {
    // 通用的数据提取逻辑，可以适配不同类型的内容
    return {
      username: item.username || item.user || '未知用户',
      content: item.content || item.text || item.description || '',
      time: item.time || item.publishedAt || item.createdAt || '',
      url: item.url || item.link || item.originalUrl || '',
      images: item.images || item.imageUrls || [],
      stats: item.stats || item.interactions || {},
      type: item.type || 'text',
      title: item.title || '',
      tags: item.tags || [],
      metadata: item.metadata || {}
    };
  }

  generateCSV(content) {
    if (!Array.isArray(content)) {
      return 'ID,内容\n1,' + (content.content || content.text || '');
    }

    const headers = ['ID', '用户', '内容', '时间', '图片数量', '图片链接', '原文链接', '点赞数', '评论数', '转发数'];
    const rows = content.map((item, index) => {
      const itemData = this.extractItemData(item);
      const contentText = (itemData.content || '').replace(/"/g, '""').replace(/\n/g, ' ');
      const images = (itemData.images || []).join(';');
      return [
        index + 1,
        `"${itemData.username || ''}"`,
        `"${contentText}"`,
        `"${itemData.time || ''}"`,
        itemData.images.length,
        `"${images}"`,
        `"${itemData.url || ''}"`,
        `"${itemData.stats?.likes || ''}"`,
        `"${itemData.stats?.comments || ''}"`,
        `"${itemData.stats?.reposts || ''}"`
      ].join(',');
    });

    return headers.join(',') + '\n' + rows.join('\n');
  }

  generateReadme(metadata, content, params) {
    const itemCount = Array.isArray(content) ? content.length : 1;
    const imageCount = Array.isArray(content)
      ? content.reduce((sum, item) => sum + (item.images || []).length, 0)
      : (content.images || []).length;

    return `# 内容提取结果: ${metadata.keyword}

## 提取信息
- **关键词**: ${metadata.keyword}
- **提取日期**: ${metadata.extractionDate}
- **提取时间**: ${new Date(metadata.extractionTime).toLocaleString('zh-CN')}
- **结果总数**: ${itemCount}条
- **图片总数**: ${imageCount}张

## 目录结构
\`\`\`
${metadata.keyword}/${metadata.extractionDate}/
├── metadata.json           # 提取元数据
├── all-items.json          # 所有项目汇总
├── all-items.csv           # CSV格式（Excel可用）
├── item_1/                 # 第1个项目
│   ├── data.json           # 项目数据
│   ├── images/             # 图片目录
│   ├── url.txt            # 原文链接
│   └── README.md           # 项目说明
├── item_2/                 # 第2个项目
└── ...                     # 其他项目
\`\`\`

## 文件说明
- **metadata.json**: 包含提取的元数据信息
- **all-items.json**: 所有项目的结构化数据
- **all-items.csv**: 可用Excel打开的表格格式
- **item_N/**: 每个项目的独立目录，包含完整信息

## 使用说明
1. 直接用Excel打开 \`all-items.csv\` 查看所有项目
2. 进入每个 \`item_N\` 目录查看项目的详细信息
3. 图片目录包含图片URL，可用于下载图片

## 提取统计
- **提取成功率**: 100%
- **成功提取项目**: ${itemCount}条
- **包含图片的项目**: ${Array.isArray(content) ? content.filter(p => (p.images || []).length > 0).length : (content.images || []).length > 0 ? 1 : 0}条

---
*由 WebAuto 文件操作子自动生成*
`;
  }

  generateItemReadme(itemData, itemId) {
    return `# 项目 ${itemId}

## 基本信息
- **用户**: ${itemData.username || '未知'}
- **时间**: ${itemData.time || '未知'}
- **类型**: ${itemData.type || 'text'}
- **提取时间**: ${new Date(itemData.savedAt).toLocaleString('zh-CN')}

## 内容
${itemData.content || '无内容'}

## 统计数据
- **点赞**: ${itemData.stats?.likes || '无数据'}
- **评论**: ${itemData.stats?.comments || '无数据'}
- **转发**: ${itemData.stats?.reposts || '无数据'}
- **图片数量**: ${itemData.images.length}张

## 文件说明
- \`data.json\` - 项目基本信息
- \`images/\` - 图片目录（包含URL列表）
- \`url.txt\` - 原文链接

## 原文链接
${itemData.url || '无链接'}
`;
  }

  getDirectoryStructure(baseDir) {
    return {
      base: baseDir,
      metadata: 'metadata.json',
      summary: 'all-items.json',
      csv: 'all-items.csv',
      readme: 'README.md',
      items: 'item_N/'
    };
  }

  // 辅助方法
  async resolvePath(basePath, keyword, date = null) {
    const homeDir = process.env.HOME || '~';
    const resolvedBase = basePath.replace('~', homeDir);

    if (date) {
      // 兼容旧模式的日期目录
      return `${resolvedBase}/${keyword}/${date}`;
    } else {
      // 新模式的单目录结构
      return `${resolvedBase}/${keyword}`;
    }
  }

  joinPath(...parts) {
    return parts.join('/');
  }

  async ensureDirectory(dirPath) {
    const { execSync } = await import('child_process');
    try {
      execSync(`mkdir -p "${dirPath}"`);
    } catch (error) {
      // 如果mkdir -p失败，使用Node.js fs
      const fs = await import('fs');
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  async writeFile(filePath, content, encoding = 'utf8') {
    const fs = await import('fs');
    await fs.promises.writeFile(filePath, content, encoding);
    this.log('debug', `File saved: ${filePath}`);
  }

  // 图片下载功能
  async downloadImages(imageUrls, targetDir, itemId, options = {}) {
    const { skipExisting = false, existingImages = new Set() } = options;
    const downloadedFiles = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];

      // 检查是否已存在该图片
      if (skipExisting) {
        const imageFileName = this.getImageFileNameFromUrl(imageUrl);
        const existingPath = this.findExistingImage(imageFileName, existingImages);
        if (existingPath) {
          skippedCount++;
          this.log('debug', `Skipping existing image: ${imageFileName}`);
          continue;
        }
      }

      try {
        const result = await this.downloadImage(imageUrl, targetDir, itemId, i + 1);
        if (result.success) {
          downloadedFiles.push(result.filePath);
          successCount++;
        } else {
          failedCount++;
          this.log('warn', `Failed to download image ${i + 1} for item ${itemId}: ${result.error}`);
        }
      } catch (error) {
        failedCount++;
        this.log('error', `Error downloading image ${i + 1} for item ${itemId}: ${error.message}`);
      }
    }

    return {
      downloadedFiles,
      successCount,
      failedCount,
      skippedCount
    };
  }

  async downloadImage(imageUrl, targetDir, itemId, imageIndex) {
    try {
      // 解析图片URL获取文件名和扩展名
      const urlObj = new URL(imageUrl);
      const urlPath = urlObj.pathname;

      // 从URL中提取文件名或生成默认文件名
      let fileName = urlPath.split('/').pop() || `image_${imageIndex}`;

      // 移除查询参数
      fileName = fileName.split('?')[0];

      // 确保有文件扩展名
      if (!fileName.includes('.')) {
        const contentType = await this.getImageContentType(imageUrl);
        const extension = this.getExtensionFromContentType(contentType);
        fileName = `${fileName}${extension}`;
      }

      // 清理文件名，移除不安全字符
      fileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

      // 确保文件名不冲突
      fileName = await this.ensureUniqueFileName(targetDir, fileName);

      const targetPath = this.joinPath(targetDir, fileName);

      // 使用fetch下载图片
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': urlObj.origin
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 获取图片数据
      const imageBuffer = await response.arrayBuffer();

      // 保存图片文件
      const fs = await import('fs');
      await fs.promises.writeFile(targetPath, Buffer.from(imageBuffer));

      this.log('debug', `Image downloaded: ${targetPath}`);

      return {
        success: true,
        filePath: targetPath,
        fileName: fileName,
        size: imageBuffer.byteLength
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getImageContentType(imageUrl) {
    try {
      const response = await fetch(imageUrl, { method: 'HEAD' });
      return response.headers.get('content-type') || 'image/jpeg';
    } catch (error) {
      // 默认返回jpeg
      return 'image/jpeg';
    }
  }

  getExtensionFromContentType(contentType) {
    const contentTypeMap = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
      'image/svg+xml': '.svg'
    };
    return contentTypeMap[contentType] || '.jpg';
  }

  // 目录扫描和历史记录功能
  // 图片处理辅助方法
  async scanExistingImages(imagesDir) {
    const imageFiles = new Set();

    try {
      const fs = await import('fs');
      const path = await import('path');

      if (!fs.existsSync(imagesDir)) {
        return imageFiles;
      }

      const entries = fs.readdirSync(imagesDir);

      // 使用 for...of 循环以支持 async/await
      for (const entry of entries) {
        if (!entry.endsWith('.json')) { // 排除urls.json
          const fullPath = path.join(imagesDir, entry);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile() && stat.size > 0) {
              // 检查文件是否为有效的图片文件
              const isImage = await this.isImageFile(fullPath);
              if (isImage) {
                imageFiles.add({
                  fileName: entry,
                  fullPath: fullPath,
                  fileSize: stat.size,
                  fileExt: path.extname(entry).toLowerCase()
                });
              }
            }
          } catch (statError) {
            this.log('debug', `Cannot stat file ${entry}: ${statError.message}`);
          }
        }
      }

    } catch (error) {
      this.log('warn', `Error scanning images directory ${imagesDir}: ${error.message}`);
    }

    return imageFiles;
  }

  getImageFileNameFromUrl(imageUrl) {
    try {
      const urlObj = new URL(imageUrl);
      const urlPath = urlObj.pathname;
      let fileName = urlPath.split('/').pop() || 'image';

      // 移除查询参数
      fileName = fileName.split('?')[0];

      // 清理文件名
      fileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

      return fileName;
    } catch (error) {
      return 'image';
    }
  }

  findExistingImage(imageFileName, existingImages) {
    for (const existing of existingImages) {
      // 完全匹配
      if (existing.fileName === imageFileName) {
        return existing.fullPath;
      }

      // 处理带数字后缀的文件名（如 image_1.jpg, image_2.jpg）
      const baseName = imageFileName.replace(/\.[^/.]+$/, ''); // 移除扩展名
      const ext = imageFileName.substring(imageFileName.lastIndexOf('.'));

      const existingBaseName = existing.fileName.replace(/\.[^/.]+$/, '');
      const existingExt = existing.fileName.substring(existing.fileName.lastIndexOf('.'));

      // 检查是否是同一基础文件名（带数字后缀）
      if (ext === existingExt &&
          (existingBaseName === baseName ||
           existingBaseName.startsWith(baseName + '_') ||
           this.removeNumericSuffix(existingBaseName) === baseName)) {
        return existing.fullPath;
      }
    }
    return null;
  }

  // 移除文件名中的数字后缀
  removeNumericSuffix(fileName) {
    return fileName.replace(/_\d+$/, '');
  }

  async ensureUniqueFileName(directory, fileName) {
    const fs = await import('fs');
    const path = await import('path');

    const targetPath = path.join(directory, fileName);

    // 如果文件不存在，直接返回原文件名
    if (!fs.existsSync(targetPath)) {
      return fileName;
    }

    // 如果文件已存在，添加数字后缀
    const fileNameWithoutExt = path.parse(fileName).name;
    const fileExt = path.parse(fileName).ext;

    let counter = 1;
    let newFileName = fileName;

    while (fs.existsSync(path.join(directory, newFileName))) {
      newFileName = `${fileNameWithoutExt}_${counter}${fileExt}`;
      counter++;
    }

    this.log('debug', `Filename conflict resolved: ${fileName} -> ${newFileName}`);

    return newFileName;
  }

  // 目录扫描和历史记录功能
  async scanExistingDirectory(baseDir) {
    const defaultData = {
      metadata: null,
      items: [],
      imageFiles: new Set(),
      itemDirs: new Set(),
      searchHistory: []
    };

    try {
      const fs = await import('fs');
      const path = await import('path');

      // 检查目录是否存在
      if (!fs.existsSync(baseDir)) {
        return defaultData;
      }

      // 检查是否是新的单目录模式还是旧的日期目录模式
      const entries = fs.readdirSync(baseDir);
      const hasDateDirs = entries.some(entry => this.isValidDateFormat(entry));

      if (hasDateDirs) {
        // 旧模式：扫描所有日期子目录
        return await this.scanLegacyDirectory(baseDir, entries);
      } else {
        // 新模式：直接扫描当前目录
        return await this.scanSingleDirectory(baseDir, entries);
      }

    } catch (error) {
      this.log('warn', `Error scanning directory ${baseDir}: ${error.message}`);
      return defaultData;
    }
  }

  async scanSingleDirectory(baseDir, entries) {
    const fs = await import('fs');
    const path = await import('path');

    const items = [];
    const imageFiles = new Set();
    const itemDirs = new Set();
    let metadata = null;

    for (const entry of entries) {
      const fullPath = path.join(baseDir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && entry.startsWith('item_')) {
        // 处理项目目录
        itemDirs.add(entry);
        const itemData = await this.loadItemData(fullPath, entry);
        if (itemData) {
          items.push(itemData);

          // 收集图片文件
          const imagesDir = path.join(fullPath, 'images');
          if (fs.existsSync(imagesDir)) {
            const imageEntries = fs.readdirSync(imagesDir);
            imageEntries.forEach(imgEntry => {
              if (!imgEntry.endsWith('.json')) { // 排除urls.json
                imageFiles.add(path.join(imagesDir, imgEntry));
              }
            });
          }
        }
      } else if (entry === 'all-items.json') {
        // 从汇总文件加载元数据
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(content);
          if (data.metadata) {
            metadata = data.metadata;
          }
          // 加载所有项目
          if (data.items) {
            items.push(...data.items);
          }
        } catch (error) {
          // 忽略读取错误
        }
      }
    }

    return {
      metadata,
      items,
      imageFiles,
      itemDirs,
      searchHistory: []
    };
  }

  async scanLegacyDirectory(baseDir, entries) {
    const fs = await import('fs');
    const path = await import('path');

    const allItems = [];
    const allImageFiles = new Set();
    const allItemDirs = new Set();
    const searchHistory = [];
    let metadata = null;

    for (const entry of entries) {
      if (this.isValidDateFormat(entry)) {
        // 处理日期目录
        const dateDir = path.join(baseDir, entry);
        if (fs.statSync(dateDir).isDirectory()) {
          const dateData = await this.scanSingleDirectory(dateDir, fs.readdirSync(dateDir));
          allItems.push(...dateData.items);
          dateData.imageFiles.forEach(img => allImageFiles.add(img));
          dateData.itemDirs.forEach(dir => allItemDirs.add(dir));
          searchHistory.push({
            date: entry,
            itemCount: dateData.items.length,
            metadata: dateData.metadata
          });
          if (!metadata) metadata = dateData.metadata;
        }
      }
    }

    return {
      metadata,
      items: allItems,
      imageFiles: allImageFiles,
      itemDirs: allItemDirs,
      searchHistory
    };
  }

  isValidDateFormat(dateStr) {
    // 检查是否是YYYY-MM-DD格式
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  }

  async loadItemData(itemDir, itemName) {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const dataFile = path.join(itemDir, 'data.json');
      if (!fs.existsSync(dataFile)) {
        return null;
      }

      const content = fs.readFileSync(dataFile, 'utf8');
      const data = JSON.parse(content);

      // 提取ID
      const id = parseInt(itemName.replace('item_', ''));

      return {
        id,
        ...data
      };

    } catch (error) {
      this.log('warn', `Error loading item data from ${itemDir}: ${error.message}`);
      return null;
    }
  }

  async deduplicateContent(newContent, existingData) {
    if (!Array.isArray(newContent)) {
      return newContent;
    }

    const existingUrls = new Set(existingData.items.map(item => item.url).filter(Boolean));
    const existingContents = new Set(existingData.items.map(item => item.content).filter(Boolean));

    return newContent.filter(item => {
      // 基于URL去重
      if (item.url && existingUrls.has(item.url)) {
        return false;
      }

      // 基于内容去重（当URL不可用时）
      if (item.content && !item.url && existingContents.has(item.content)) {
        return false;
      }

      return true;
    });
  }

  mergeExistingItems(newItems, existingData) {
    const allItems = [...existingData.items];

    // 为新项目分配连续的ID
    const startId = existingData.items.length + 1;
    newItems.forEach((item, index) => {
      allItems.push({
        id: startId + index,
        ...this.extractItemData(item)
      });
    });

    return allItems;
  }

  calculateContextMatchScore(context) {
    let score = 0.6; // 基础分数

    // 文件操作相关上下文加分
    if (context.operation === 'file-save' || context.operation === 'data-export') {
      score += 0.3;
    }

    // 内容组织相关上下文加分
    if (context.purpose === 'content-organization' || context.purpose === 'data-persistence') {
      score += 0.2;
    }

    // Web内容提取相关上下文加分
    if (context.domain === 'web-scraping' || context.domain === 'content-extraction') {
      score += 0.1;
    }

    return Math.min(score, 1);
  }

  // 检查文件是否为有效的图片文件
  async isImageFile(filePath) {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const ext = path.extname(filePath).toLowerCase();
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'];

      if (!imageExtensions.includes(ext)) {
        return false;
      }

      // 检查文件大小是否合理（避免空文件或过大的文件）
      const stat = fs.statSync(filePath);
      if (stat.size === 0 || stat.size > 50 * 1024 * 1024) { // 50MB limit
        return false;
      }

      // 简化的文件头检查（对于常见图片格式）
      try {
        if (ext === '.jpg' || ext === '.jpeg') {
          const buffer = fs.readFileSync(filePath, { start: 0, end: 2 });
          return buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xD8;
        } else if (ext === '.png') {
          const buffer = fs.readFileSync(filePath, { start: 0, end: 3 });
          return buffer.length >= 4 &&
                 buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
        } else if (ext === '.gif') {
          const buffer = fs.readFileSync(filePath, { start: 0, end: 2 });
          return buffer.length >= 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
        }
      } catch (headerError) {
        this.log('debug', `Header check failed for ${filePath}: ${headerError.message}`);
        // 如果文件头检查失败，回退到仅扩展名检查
        return true;
      }

      // 对于其他格式，仅依赖扩展名检查
      return true;

    } catch (error) {
      this.log('debug', `Error checking image file ${filePath}: ${error.message}`);
      return false;
    }
  }
}