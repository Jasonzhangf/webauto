/**
 * File Operations - Micro-operations for file I/O operations
 */

import { BaseOperation } from '../core/BaseOperation.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * JSON File Saver Operation - Save data to JSON files
 */
export class JsonFileSaverOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'JsonFileSaverOperation';
    this.description = 'Save data to JSON files with formatting and validation';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['save-file', 'file-operation', 'data-export'];
    this.supportedContainers = ['file-system', 'any'];
    this.capabilities = ['file-writing', 'json-formatting', 'data-export'];
    
    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'low'
    };
    
    this.requiredParameters = ['data', 'filePath'];
    this.optionalParameters = {
      indent: 2,
      createDirectory: true,
      overwrite: true,
      backup: false,
      backupSuffix: '.backup',
      validateJson: true,
      minify: false,
      includeMetadata: true,
      metadataFields: ['generatedAt', 'source', 'version'],
      prettyPrint: true,
      sortKeys: false,
      encoding: 'utf8',
      permissions: '644'
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
    this.log('info', 'Starting JSON file save', { 
      filePath: finalParams.filePath,
      dataSize: JSON.stringify(finalParams.data).length 
    });
    
    try {
      // Prepare data
      let dataToSave = finalParams.data;
      
      // Add metadata if requested
      if (finalParams.includeMetadata) {
        dataToSave = this.addMetadata(dataToSave, finalParams.metadataFields);
      }
      
      // Sort keys if requested
      if (finalParams.sortKeys && typeof dataToSave === 'object' && !Array.isArray(dataToSave)) {
        dataToSave = this.sortObjectKeys(dataToSave);
      }
      
      // Convert to JSON string
      let jsonString = JSON.stringify(dataToSave, null, finalParams.prettyPrint ? finalParams.indent : undefined);
      
      // Minify if requested
      if (finalParams.minify) {
        jsonString = JSON.stringify(dataToSave);
      }
      
      // Validate JSON if requested
      if (finalParams.validateJson) {
        this.validateJsonString(jsonString);
      }
      
      // Ensure directory exists
      if (finalParams.createDirectory) {
        await this.ensureDirectory(finalParams.filePath);
      }
      
      // Create backup if requested and file exists
      if (finalParams.backup && await this.fileExists(finalParams.filePath)) {
        await this.createBackup(finalParams.filePath, finalParams.backupSuffix);
      }
      
      // Check if file exists and overwrite is false
      if (!finalParams.overwrite && await this.fileExists(finalParams.filePath)) {
        throw new Error(`File already exists and overwrite is false: ${finalParams.filePath}`);
      }
      
      // Write file
      await fs.writeFile(finalParams.filePath, jsonString, {
        encoding: finalParams.encoding
      });
      
      // Set file permissions if specified
      if (finalParams.permissions) {
        await fs.chmod(finalParams.filePath, finalParams.permissions);
      }
      
      // Get file stats
      const fileStats = await fs.stat(finalParams.filePath);
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'JSON file save completed', { 
        filePath: finalParams.filePath,
        fileSize: fileStats.size,
        executionTime 
      });
      
      return {
        success: true,
        result: {
          filePath: finalParams.filePath,
          fileSize: fileStats.size,
          checksum: await this.calculateChecksum(finalParams.filePath),
          backupCreated: finalParams.backup && await this.fileExists(finalParams.filePath + finalParams.backupSuffix)
        },
        metadata: {
          dataSize: jsonString.length,
          encoding: finalParams.encoding,
          permissions: finalParams.permissions,
          executionTime
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'JSON file save failed', { 
        filePath: finalParams.filePath,
        error: error.message, 
        executionTime 
      });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          filePath: finalParams.filePath,
          executionTime
        }
      };
    }
  }
  
  addMetadata(data, fields) {
    const metadata = {};
    
    if (fields.includes('generatedAt')) {
      metadata.generatedAt = new Date().toISOString();
    }
    
    if (fields.includes('source')) {
      metadata.source = 'operations-framework';
    }
    
    if (fields.includes('version')) {
      metadata.version = '1.0.0';
    }
    
    if (Array.isArray(data)) {
      return {
        metadata,
        items: data
      };
    } else if (typeof data === 'object' && data !== null) {
      return {
        ...data,
        metadata
      };
    } else {
      return {
        value: data,
        metadata
      };
    }
  }
  
  sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }
    
    const sorted = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sorted[key] = this.sortObjectKeys(obj[key]);
    }
    
    return sorted;
  }
  
  validateJsonString(jsonString) {
    try {
      JSON.parse(jsonString);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
  }
  
  async ensureDirectory(filePath) {
    const directory = path.dirname(filePath);
    try {
      await fs.access(directory);
    } catch (error) {
      await fs.mkdir(directory, { recursive: true });
    }
  }
  
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async createBackup(filePath, suffix) {
    const backupPath = filePath + suffix;
    await fs.copyFile(filePath, backupPath);
    this.log('info', 'Created backup file', { original: filePath, backup: backupPath });
  }
  
  async calculateChecksum(filePath) {
    const crypto = await import('crypto');
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }
}

/**
 * Markdown File Saver Operation - Save data to Markdown files
 */
export class MarkdownFileSaverOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'MarkdownFileSaverOperation';
    this.description = 'Save data to Markdown files with customizable templates';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['save-file', 'file-operation', 'data-export'];
    this.supportedContainers = ['file-system', 'any'];
    this.capabilities = ['file-writing', 'markdown-generation', 'data-export'];
    
    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'low'
    };
    
    this.requiredParameters = ['data', 'filePath'];
    this.optionalParameters = {
      template: 'default',
      customTemplate: '',
      title: '',
      description: '',
      createDirectory: true,
      overwrite: true,
      backup: false,
      backupSuffix: '.backup',
      encoding: 'utf8',
      permissions: '644',
      frontmatter: {},
      includeTableOfContents: false,
      tableOfContentsTitle: 'Table of Contents',
      maxDepth: 3,
      linkStyle: 'reference', // inline, reference
      imageBasePath: './images/',
      includeMetadata: true,
      generateStats: true,
      codeBlockLanguage: 'json',
      dateFormat: 'YYYY-MM-DD HH:mm:ss'
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
    this.log('info', 'Starting Markdown file save', { 
      filePath: finalParams.filePath,
      template: finalParams.template 
    });
    
    try {
      // Generate Markdown content
      const markdownContent = await this.generateMarkdown(finalParams.data, finalParams);
      
      // Ensure directory exists
      if (finalParams.createDirectory) {
        await this.ensureDirectory(finalParams.filePath);
      }
      
      // Create backup if requested and file exists
      if (finalParams.backup && await this.fileExists(finalParams.filePath)) {
        await this.createBackup(finalParams.filePath, finalParams.backupSuffix);
      }
      
      // Check if file exists and overwrite is false
      if (!finalParams.overwrite && await this.fileExists(finalParams.filePath)) {
        throw new Error(`File already exists and overwrite is false: ${finalParams.filePath}`);
      }
      
      // Write file
      await fs.writeFile(finalParams.filePath, markdownContent, {
        encoding: finalParams.encoding
      });
      
      // Set file permissions if specified
      if (finalParams.permissions) {
        await fs.chmod(finalParams.filePath, finalParams.permissions);
      }
      
      // Get file stats
      const fileStats = await fs.stat(finalParams.filePath);
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Markdown file save completed', { 
        filePath: finalParams.filePath,
        fileSize: fileStats.size,
        executionTime 
      });
      
      return {
        success: true,
        result: {
          filePath: finalParams.filePath,
          fileSize: fileStats.size,
          checksum: await this.calculateChecksum(finalParams.filePath),
          backupCreated: finalParams.backup && await this.fileExists(finalParams.filePath + finalParams.backupSuffix),
          wordCount: this.countWords(markdownContent)
        },
        metadata: {
          contentLength: markdownContent.length,
          encoding: finalParams.encoding,
          permissions: finalParams.permissions,
          executionTime
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Markdown file save failed', { 
        filePath: finalParams.filePath,
        error: error.message, 
        executionTime 
      });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          filePath: finalParams.filePath,
          executionTime
        }
      };
    }
  }
  
  async generateMarkdown(data, params) {
    const dataForConversion = Array.isArray(data) ? data : [data];
    
    // Use MarkdownConverterOperation to generate content
    const { MarkdownConverterOperation } = await import('./DataProcessingOperations.js');
    const converter = new MarkdownConverterOperation();
    
    const conversionResult = await converter.execute({}, {
      data: dataForConversion,
      template: params.template,
      customTemplate: params.customTemplate,
      title: params.title,
      description: params.description,
      includeMetadata: params.includeMetadata,
      frontmatter: params.frontmatter,
      dateFormat: params.dateFormat,
      codeBlockLanguage: params.codeBlockLanguage
    });
    
    if (!conversionResult.success) {
      throw new Error(`Failed to generate markdown: ${conversionResult.error}`);
    }
    
    let markdown = conversionResult.result.markdown;
    
    // Add table of contents if requested
    if (params.includeTableOfContents) {
      markdown = this.addTableOfContents(markdown, params.tableOfContentsTitle, params.maxDepth);
    }
    
    // Add statistics if requested
    if (params.generateStats) {
      markdown = this.addStatistics(markdown, dataForConversion, params);
    }
    
    return markdown;
  }
  
  addTableOfContents(markdown, title, maxDepth) {
    const lines = markdown.split('\n');
    const toc = [title || 'Table of Contents', ''];
    
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        
        if (level <= maxDepth) {
          const indent = '  '.repeat(level - 1);
          const slug = this.generateSlug(text);
          toc.push(`${indent}- [${text}](#${slug})`);
        }
      }
    }
    
    const tocMarkdown = toc.join('\n');
    return tocMarkdown + '\n\n' + markdown;
  }
  
  generateSlug(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  
  addStatistics(markdown, data, params) {
    const stats = this.generateDataStatistics(data);
    let statsMarkdown = '## Statistics\n\n';
    
    for (const [key, value] of Object.entries(stats)) {
      statsMarkdown += `- **${key}**: ${value}\n`;
    }
    
    return markdown + '\n\n' + statsMarkdown;
  }
  
  generateDataStatistics(data) {
    if (data.length === 0) return {};
    
    const stats = {
      'Total Items': data.length,
      'Generated At': new Date().toLocaleString()
    };
    
    if (data.length > 0 && typeof data[0] === 'object') {
      const fields = Object.keys(data[0]);
      stats['Fields'] = fields.join(', ');
      stats['Field Count'] = fields.length;
    }
    
    // Calculate content statistics
    const totalContent = data.map(item => JSON.stringify(item)).join('');
    stats['Total Characters'] = totalContent.length;
    stats['Estimated Words'] = Math.ceil(totalContent.split(/\s+/).length);
    
    return stats;
  }
  
  countWords(text) {
    return text.split(/\s+/).length;
  }
  
  async ensureDirectory(filePath) {
    const directory = path.dirname(filePath);
    try {
      await fs.access(directory);
    } catch (error) {
      await fs.mkdir(directory, { recursive: true });
    }
  }
  
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async createBackup(filePath, suffix) {
    const backupPath = filePath + suffix;
    await fs.copyFile(filePath, backupPath);
    this.log('info', 'Created backup file', { original: filePath, backup: backupPath });
  }
  
  async calculateChecksum(filePath) {
    const crypto = await import('crypto');
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }
}

/**
 * CSV File Saver Operation - Save data to CSV files
 */
export class CsvFileSaverOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'CsvFileSaverOperation';
    this.description = 'Save data to CSV files with customizable formatting and encoding';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['save-file', 'file-operation', 'data-export'];
    this.supportedContainers = ['file-system', 'any'];
    this.capabilities = ['file-writing', 'csv-formatting', 'data-export'];
    
    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'low'
    };
    
    this.requiredParameters = ['data', 'filePath'];
    this.optionalParameters = {
      delimiter: ',',
      encoding: 'utf8',
      bom: true, // Add BOM for Excel compatibility
      includeHeaders: true,
      headers: [],
      headerCase: 'original', // original, uppercase, lowercase
      quoteAll: false,
      escapeQuotes: true,
      lineEnding: '\n', // \n, \r\n
      dateFormat: 'YYYY-MM-DD',
      numberFormat: 'decimal',
      booleanFormat: 'truefalse', // truefalse, yesno, 10
      nullValue: '',
      createDirectory: true,
      overwrite: true,
      backup: false,
      backupSuffix: '.backup',
      permissions: '644',
      includeRowNumbers: false,
      rowNumberColumn: '#',
      validateData: true,
      maxRows: 0,
      chunkSize: 10000
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
    this.log('info', 'Starting CSV file save', { 
      filePath: finalParams.filePath,
      rowCount: Array.isArray(finalParams.data) ? finalParams.data.length : 1 
    });
    
    try {
      // Prepare data
      const csvData = await this.prepareData(finalParams.data, finalParams);
      
      // Validate data if requested
      if (finalParams.validateData) {
        this.validateCsvData(csvData);
      }
      
      // Generate CSV content
      let csvContent = this.generateCsvContent(csvData, finalParams);
      
      // Add BOM if requested
      if (finalParams.bom) {
        csvContent = '\uFEFF' + csvContent;
      }
      
      // Ensure directory exists
      if (finalParams.createDirectory) {
        await this.ensureDirectory(finalParams.filePath);
      }
      
      // Create backup if requested and file exists
      if (finalParams.backup && await this.fileExists(finalParams.filePath)) {
        await this.createBackup(finalParams.filePath, finalParams.backupSuffix);
      }
      
      // Check if file exists and overwrite is false
      if (!finalParams.overwrite && await this.fileExists(finalParams.filePath)) {
        throw new Error(`File already exists and overwrite is false: ${finalParams.filePath}`);
      }
      
      // Write file
      await fs.writeFile(finalParams.filePath, csvContent, {
        encoding: finalParams.encoding
      });
      
      // Set file permissions if specified
      if (finalParams.permissions) {
        await fs.chmod(finalParams.filePath, finalParams.permissions);
      }
      
      // Get file stats
      const fileStats = await fs.stat(finalParams.filePath);
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'CSV file save completed', { 
        filePath: finalParams.filePath,
        fileSize: fileStats.size,
        rowCount: csvData.length,
        executionTime 
      });
      
      return {
        success: true,
        result: {
          filePath: finalParams.filePath,
          fileSize: fileStats.size,
          checksum: await this.calculateChecksum(finalParams.filePath),
          backupCreated: finalParams.backup && await this.fileExists(finalParams.filePath + finalParams.backupSuffix),
          rowCount: csvData.length,
          columnCount: csvData.length > 0 ? Object.keys(csvData[0]).length : 0
        },
        metadata: {
          delimiter: finalParams.delimiter,
          encoding: finalParams.encoding,
          hasHeaders: finalParams.includeHeaders,
          executionTime
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'CSV file save failed', { 
        filePath: finalParams.filePath,
        error: error.message, 
        executionTime 
      });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          filePath: finalParams.filePath,
          executionTime
        }
      };
    }
  }
  
  async prepareData(data, params) {
    // Ensure data is an array
    let dataArray = Array.isArray(data) ? data : [data];
    
    // Limit rows if specified
    if (params.maxRows > 0 && dataArray.length > params.maxRows) {
      dataArray = dataArray.slice(0, params.maxRows);
    }
    
    // Process each row
    return dataArray.map((item, index) => {
      const row = {};
      
      // Add row number if requested
      if (params.includeRowNumbers) {
        row[params.rowNumberColumn] = index + 1;
      }
      
      // Process each field
      for (const [key, value] of Object.entries(item)) {
        row[key] = this.formatValue(value, params);
      }
      
      return row;
    });
  }
  
  formatValue(value, params) {
    if (value === null || value === undefined) {
      return params.nullValue;
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'number') {
      return this.formatNumber(value, params.numberFormat);
    }
    
    if (typeof value === 'boolean') {
      return this.formatBoolean(value, params.booleanFormat);
    }
    
    if (value instanceof Date) {
      return this.formatDate(value, params.dateFormat);
    }
    
    if (Array.isArray(value)) {
      return value.map(v => this.formatValue(v, params)).join('; ');
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  }
  
  formatNumber(value, format) {
    switch (format) {
      case 'integer':
        return Math.floor(value).toString();
      case 'float':
        return value.toFixed(2);
      case 'percentage':
        return (value * 100).toFixed(1) + '%';
      case 'decimal':
      default:
        return value.toString();
    }
  }
  
  formatBoolean(value, format) {
    switch (format) {
      case 'yesno':
        return value ? 'Yes' : 'No';
      case '10':
        return value ? '1' : '0';
      case 'truefalse':
      default:
        return value ? 'true' : 'false';
    }
  }
  
  formatDate(date, format) {
    if (format === 'ISO') {
      return date.toISOString();
    }
    
    // Simple format for now
    return date.toLocaleDateString();
  }
  
  generateCsvContent(data, params) {
    if (data.length === 0) {
      return '';
    }
    
    // Get headers
    let headers = params.headers.length > 0 ? params.headers : Object.keys(data[0]);
    
    // Apply header case transformation
    headers = headers.map(header => {
      switch (params.headerCase) {
        case 'uppercase':
          return header.toUpperCase();
        case 'lowercase':
          return header.toLowerCase();
        case 'original':
        default:
          return header;
      }
    });
    
    let csvContent = '';
    
    // Add headers if requested
    if (params.includeHeaders) {
      csvContent += this.formatCsvRow(headers, params) + params.lineEnding;
    }
    
    // Add data rows
    for (const row of data) {
      const rowData = headers.map(header => row[header] || '');
      csvContent += this.formatCsvRow(rowData, params) + params.lineEnding;
    }
    
    return csvContent;
  }
  
  formatCsvRow(rowData, params) {
    return rowData.map(field => {
      if (field === null || field === undefined) {
        return params.nullValue;
      }
      
      const fieldString = String(field);
      
      // Check if field needs quoting
      const needsQuoting = params.quoteAll || 
                         fieldString.includes(params.delimiter) || 
                         fieldString.includes('\n') || 
                         fieldString.includes('\r') || 
                         fieldString.includes('"');
      
      if (!needsQuoting) {
        return fieldString;
      }
      
      // Escape quotes
      let escapedField = fieldString;
      if (params.escapeQuotes) {
        escapedField = fieldString.replace(/"/g, '""');
      }
      
      return `"${escapedField}"`;
    }).join(params.delimiter);
  }
  
  validateCsvData(data) {
    if (data.length === 0) {
      return;
    }
    
    const headers = Object.keys(data[0]);
    
    // Check that all rows have the same structure
    for (let i = 1; i < data.length; i++) {
      const rowHeaders = Object.keys(data[i]);
      
      if (rowHeaders.length !== headers.length) {
        throw new Error(`Row ${i} has ${rowHeaders.length} columns, expected ${headers.length}`);
      }
      
      for (const header of headers) {
        if (!data[i].hasOwnProperty(header)) {
          throw new Error(`Row ${i} is missing column: ${header}`);
        }
      }
    }
  }
  
  async ensureDirectory(filePath) {
    const directory = path.dirname(filePath);
    try {
      await fs.access(directory);
    } catch (error) {
      await fs.mkdir(directory, { recursive: true });
    }
  }
  
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async createBackup(filePath, suffix) {
    const backupPath = filePath + suffix;
    await fs.copyFile(filePath, backupPath);
    this.log('info', 'Created backup file', { original: filePath, backup: backupPath });
  }
  
  async calculateChecksum(filePath) {
    const crypto = await import('crypto');
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }
}