/**
 * 可配置数据处理器操作
 * 用于数据的转换、清洗和格式化
 */

import BaseOperation from '../BaseOperation.js';

export class ConfigurableDataProcessorOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'ConfigurableDataProcessorOperation';
    this.description = '可配置数据处理器，支持数据转换、清洗和格式化';
    this.version = '1.0.0';
  }

  async execute(context, params = {}) {
    try {
      const { 
        operation = 'transform',
        sourceData,
        transformationRules,
        outputFormat = 'json'
      } = params;

      this.logger.info('Executing data processor operation', { 
        operation, 
        outputFormat 
      });

      let result;

      switch (operation) {
        case 'transform':
          result = await this.transformData(context, sourceData, transformationRules);
          break;
        case 'clean':
          result = await this.cleanData(context, sourceData);
          break;
        case 'format':
          result = await this.formatData(context, sourceData, outputFormat);
          break;
        case 'validate':
          result = await this.validateData(context, sourceData);
          break;
        case 'merge':
          result = await this.mergeData(context, sourceData);
          break;
        default:
          throw new Error(`Unsupported data processor operation: ${operation}`);
      }

      return {
        success: true,
        result,
        metadata: {
          operation,
          inputType: typeof sourceData,
          outputType: typeof result,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      this.logger.error('Data processor operation failed', { 
        error: error.message,
        params 
      });
      throw error;
    }
  }

  async transformData(context, data, rules) {
    if (!data || !rules) {
      throw new Error('Source data and transformation rules are required');
    }

    this.logger.info('Transforming data', { 
      dataType: typeof data,
      rulesCount: Object.keys(rules).length 
    });

    let transformed = Array.isArray(data) ? data : [data];

    // 应用转换规则
    for (const rule of rules) {
      switch (rule.type) {
        case 'map':
          transformed = transformed.map(item => this.applyMapping(item, rule.mapping));
          break;
        case 'filter':
          transformed = transformed.filter(item => this.applyFilter(item, rule.condition));
          break;
        case 'aggregate':
          transformed = this.applyAggregation(transformed, rule.aggregation);
          break;
        case 'sort':
          transformed = this.applySorting(transformed, rule.sortBy);
          break;
        case 'group':
          transformed = this.applyGrouping(transformed, rule.groupBy);
          break;
        default:
          this.logger.warn('Unknown transformation rule type', { type: rule.type });
      }
    }

    return transformed;
  }

  async cleanData(context, data) {
    this.logger.info('Cleaning data', { dataType: typeof data });

    let cleaned = Array.isArray(data) ? data : [data];

    // 清理空值
    cleaned = cleaned.filter(item => item && Object.keys(item).length > 0);

    // 标准化数据格式
    cleaned = cleaned.map(item => {
      const cleanedItem = {};
      for (const [key, value] of Object.entries(item)) {
        if (value !== null && value !== undefined && value !== '') {
          cleanedItem[key.trim()] = this.normalizeValue(value);
        }
      }
      return cleanedItem;
    });

    return cleaned;
  }

  async formatData(context, data, format) {
    this.logger.info('Formatting data', { format });

    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'csv':
        return this.formatAsCSV(data);
      case 'xml':
        return this.formatAsXML(data);
      case 'markdown':
        return this.formatAsMarkdown(data);
      default:
        throw new Error(`Unsupported output format: ${format}`);
    }
  }

  async validateData(context, data) {
    this.logger.info('Validating data');

    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      statistics: {}
    };

    if (!data) {
      validation.isValid = false;
      validation.errors.push('Data is null or undefined');
      return validation;
    }

    const dataArray = Array.isArray(data) ? data : [data];

    // 基本统计
    validation.statistics = {
      totalRecords: dataArray.length,
      fields: this.getFields(dataArray),
      nullCount: dataArray.filter(item => !item).length,
      emptyCount: dataArray.filter(item => item && Object.keys(item).length === 0).length
    };

    // 数据完整性检查
    dataArray.forEach((item, index) => {
      if (!item) {
        validation.errors.push(`Record ${index} is null`);
        return;
      }

      if (Object.keys(item).length === 0) {
        validation.warnings.push(`Record ${index} is empty`);
      }
    });

    validation.isValid = validation.errors.length === 0;

    return validation;
  }

  async mergeData(context, dataSources) {
    this.logger.info('Merging data sources', { sourceCount: dataSources.length });

    let merged = [];

    for (const source of dataSources) {
      if (Array.isArray(source)) {
        merged = merged.concat(source);
      } else if (source && typeof source === 'object') {
        merged.push(source);
      }
    }

    // 去重
    const unique = new Set();
    merged = merged.filter(item => {
      const key = JSON.stringify(item);
      if (unique.has(key)) {
        return false;
      }
      unique.add(key);
      return true;
    });

    return merged;
  }

  // 辅助方法
  applyMapping(item, mapping) {
    const mapped = {};
    for (const [sourceKey, targetKey] of Object.entries(mapping)) {
      if (item.hasOwnProperty(sourceKey)) {
        mapped[targetKey] = item[sourceKey];
      }
    }
    return { ...item, ...mapped };
  }

  applyFilter(item, condition) {
    // 简单的条件过滤实现
    for (const [field, expectedValue] of Object.entries(condition)) {
      if (item[field] !== expectedValue) {
        return false;
      }
    }
    return true;
  }

  applyAggregation(data, aggregation) {
    // 简单的聚合实现
    if (aggregation.type === 'count') {
      return data.length;
    } else if (aggregation.type === 'sum') {
      return data.reduce((sum, item) => sum + (Number(item[aggregation.field]) || 0), 0);
    } else if (aggregation.type === 'average') {
      const sum = data.reduce((sum, item) => sum + (Number(item[aggregation.field]) || 0), 0);
      return sum / data.length;
    }
    return data;
  }

  applySorting(data, sortBy) {
    return data.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
      return 0;
    });
  }

  applyGrouping(data, groupBy) {
    const groups = {};
    data.forEach(item => {
      const key = item[groupBy];
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });
    return groups;
  }

  normalizeValue(value) {
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  }

  getFields(data) {
    const fields = new Set();
    data.forEach(item => {
      if (item) {
        Object.keys(item).forEach(field => fields.add(field));
      }
    });
    return Array.from(fields);
  }

  formatAsCSV(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    data.forEach(item => {
      const row = headers.map(header => {
        const value = item[header];
        return typeof value === 'string' && value.includes(',') ? 
          `"${value}"` : value;
      });
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  formatAsXML(data) {
    if (!Array.isArray(data)) {
      return this.objectToXML('data', data);
    }

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<data>\n';
    data.forEach((item, index) => {
      xml += `  <item index="${index}">\n`;
      xml += this.objectToXMLFields(item, 2);
      xml += '  </item>\n';
    });
    xml += '</data>';
    return xml;
  }

  formatAsMarkdown(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return 'No data available';
    }

    const headers = Object.keys(data[0]);
    let markdown = '| ' + headers.join(' | ') + ' |\n';
    markdown += '|' + headers.map(() => '---').join('|') + '|\n';

    data.forEach(item => {
      markdown += '| ' + headers.map(header => {
        const value = item[header];
        return value !== null && value !== undefined ? value : '';
      }).join(' | ') + ' |\n';
    });

    return markdown;
  }

  objectToXML(name, obj) {
    let xml = `<${name}>`;
    if (typeof obj === 'object' && obj !== null) {
      xml += '\n' + this.objectToXMLFields(obj, 1) + `</${name}>`;
    } else {
      xml += obj + `</${name}>`;
    }
    return xml;
  }

  objectToXMLFields(obj, indent) {
    let xml = '';
    const spaces = '  '.repeat(indent);
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        xml += `${spaces}<${key}>\n${this.objectToXMLFields(value, indent + 1)}${spaces}</${key}>\n`;
      } else {
        xml += `${spaces}<${key}>${value}</${key}>\n`;
      }
    }
    return xml;
  }
}

export default ConfigurableDataProcessorOperation;