/**
 * Data Processing Operations - Micro-operations for data transformation and processing
 */

import { BaseOperation } from '../core/BaseOperation.js';

/**
 * Data Merger Operation - Merge multiple data sources
 */
export class DataMergerOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'DataMergerOperation';
    this.description = 'Merge multiple data sources with configurable strategies';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['merge-data', 'data-processing', 'data-combination'];
    this.supportedContainers = ['data-container', 'any'];
    this.capabilities = ['data-merging', 'data-processing', 'data-transformation'];
    
    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'medium'
    };
    
    this.requiredParameters = ['dataSources'];
    this.optionalParameters = {
      mergeStrategy: 'concat', // concat, merge, join, union
      keyField: 'id', // Field to use for merging
      conflictStrategy: 'overwrite', // overwrite, keep, combine, error
      deduplicate: true,
      sortResults: false,
      sortBy: '',
      sortOrder: 'asc', // asc, desc
      filterConditions: {},
      transformFields: {},
      maxResults: 0,
      preserveOriginal: false
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
    this.log('info', 'Starting data merge', { 
      sourcesCount: finalParams.dataSources.length,
      strategy: finalParams.mergeStrategy 
    });
    
    try {
      let mergedData = [];
      
      // Apply merge strategy
      switch (finalParams.mergeStrategy) {
        case 'concat':
          mergedData = this.concatMerge(finalParams.dataSources, finalParams);
          break;
        case 'merge':
          mergedData = this.keyBasedMerge(finalParams.dataSources, finalParams);
          break;
        case 'join':
          mergedData = this.joinMerge(finalParams.dataSources, finalParams);
          break;
        case 'union':
          mergedData = this.unionMerge(finalParams.dataSources, finalParams);
          break;
        default:
          throw new Error(`Unknown merge strategy: ${finalParams.mergeStrategy}`);
      }
      
      // Apply transformations
      if (Object.keys(finalParams.transformFields).length > 0) {
        mergedData = this.transformFields(mergedData, finalParams.transformFields);
      }
      
      // Apply filters
      if (Object.keys(finalParams.filterConditions).length > 0) {
        mergedData = this.filterData(mergedData, finalParams.filterConditions);
      }
      
      // Sort results
      if (finalParams.sortResults && finalParams.sortBy) {
        mergedData = this.sortData(mergedData, finalParams.sortBy, finalParams.sortOrder);
      }
      
      // Limit results
      if (finalParams.maxResults > 0) {
        mergedData = mergedData.slice(0, finalParams.maxResults);
      }
      
      // Add metadata
      const result = {
        data: mergedData,
        metadata: {
          mergeStrategy: finalParams.mergeStrategy,
          originalCount: finalParams.dataSources.reduce((sum, source) => sum + (Array.isArray(source) ? source.length : 1), 0),
          mergedCount: mergedData.length,
          keyField: finalParams.keyField,
          conflictStrategy: finalParams.conflictStrategy,
          transformations: Object.keys(finalParams.transformFields),
          filters: Object.keys(finalParams.filterConditions)
        }
      };
      
      if (!finalParams.preserveOriginal) {
        result.metadata.dataSources = finalParams.dataSources.map((source, index) => ({
          index,
          type: Array.isArray(source) ? 'array' : 'object',
          count: Array.isArray(source) ? source.length : 1
        }));
      } else {
        result.metadata.originalData = finalParams.dataSources;
      }
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Data merge completed', { 
        mergedCount: mergedData.length,
        executionTime 
      });
      
      return {
        success: true,
        result,
        metadata: {
          executionTime,
          processingStats: result.metadata
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Data merge failed', { error: error.message, executionTime });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          executionTime
        }
      };
    }
  }
  
  concatMerge(dataSources, params) {
    let result = [];
    
    for (const source of dataSources) {
      if (Array.isArray(source)) {
        result = result.concat(source);
      } else {
        result.push(source);
      }
    }
    
    if (params.deduplicate) {
      result = this.deduplicate(result, params.keyField);
    }
    
    return result;
  }
  
  keyBasedMerge(dataSources, params) {
    const resultMap = new Map();
    
    for (const source of dataSources) {
      const items = Array.isArray(source) ? source : [source];
      
      for (const item of items) {
        const keyValue = item[params.keyField];
        
        if (!keyValue) {
          this.log('warn', 'Item missing key field', { item });
          continue;
        }
        
        if (resultMap.has(keyValue)) {
          // Handle conflict
          const existing = resultMap.get(keyValue);
          const merged = this.resolveConflict(existing, item, params.conflictStrategy);
          resultMap.set(keyValue, merged);
        } else {
          resultMap.set(keyValue, { ...item });
        }
      }
    }
    
    return Array.from(resultMap.values());
  }
  
  joinMerge(dataSources, params) {
    if (dataSources.length < 2) {
      throw new Error('Join merge requires at least 2 data sources');
    }
    
    const primary = Array.isArray(dataSources[0]) ? dataSources[0] : [dataSources[0]];
    const secondary = dataSources.slice(1);
    
    return primary.map(primaryItem => {
      const keyValue = primaryItem[params.keyField];
      let joined = { ...primaryItem };
      
      for (const source of secondary) {
        const items = Array.isArray(source) ? source : [source];
        const matchingItem = items.find(item => item[params.keyField] === keyValue);
        
        if (matchingItem) {
          Object.assign(joined, matchingItem);
        }
      }
      
      return joined;
    });
  }
  
  unionMerge(dataSources, params) {
    const allItems = dataSources.flatMap(source => Array.isArray(source) ? source : [source]);
    const uniqueMap = new Map();
    
    for (const item of allItems) {
      const signature = this.createItemSignature(item, params.keyField);
      uniqueMap.set(signature, item);
    }
    
    return Array.from(uniqueMap.values());
  }
  
  resolveConflict(existing, newItem, strategy) {
    switch (strategy) {
      case 'overwrite':
        return { ...existing, ...newItem };
      case 'keep':
        return existing;
      case 'combine':
        return this.combineFields(existing, newItem);
      case 'error':
        throw new Error(`Conflict detected for key ${existing[this.keyField]}`);
      default:
        return { ...existing, ...newItem };
    }
  }
  
  combineFields(obj1, obj2) {
    const result = { ...obj1 };
    
    for (const [key, value] of Object.entries(obj2)) {
      if (result[key] !== undefined && result[key] !== value) {
        if (Array.isArray(result[key]) || Array.isArray(value)) {
          result[key] = this.combineArrays(result[key], value);
        } else {
          result[key] = [result[key], value];
        }
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  combineArrays(arr1, arr2) {
    const a1 = Array.isArray(arr1) ? arr1 : [arr1];
    const a2 = Array.isArray(arr2) ? arr2 : [arr2];
    return [...new Set([...a1, ...a2])];
  }
  
  deduplicate(items, keyField) {
    const seen = new Set();
    return items.filter(item => {
      const key = item[keyField] || JSON.stringify(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  
  createItemSignature(item, keyField) {
    if (keyField && item[keyField]) {
      return `${keyField}:${item[keyField]}`;
    }
    return JSON.stringify(item);
  }
  
  transformFields(data, transformations) {
    return data.map(item => {
      const transformed = { ...item };
      
      for (const [field, transform] of Object.entries(transformations)) {
        if (transformed[field] !== undefined) {
          transformed[field] = this.applyTransformation(transformed[field], transform);
        }
      }
      
      return transformed;
    });
  }
  
  applyTransformation(value, transform) {
    if (typeof transform === 'function') {
      return transform(value);
    }
    
    if (typeof transform === 'string') {
      switch (transform) {
        case 'uppercase':
          return String(value).toUpperCase();
        case 'lowercase':
          return String(value).toLowerCase();
        case 'trim':
          return String(value).trim();
        case 'number':
          return Number(value);
        case 'string':
          return String(value);
        case 'boolean':
          return Boolean(value);
        default:
          return value;
      }
    }
    
    return value;
  }
  
  filterData(data, conditions) {
    return data.filter(item => {
      for (const [field, condition] of Object.entries(conditions)) {
        if (!this.matchesCondition(item[field], condition)) {
          return false;
        }
      }
      return true;
    });
  }
  
  matchesCondition(value, condition) {
    if (typeof condition === 'object' && condition !== null) {
      if (condition.operator && condition.value !== undefined) {
        return this.applyOperator(value, condition.operator, condition.value);
      }
    }
    
    return value === condition;
  }
  
  applyOperator(value, operator, compareValue) {
    switch (operator) {
      case 'eq': return value === compareValue;
      case 'ne': return value !== compareValue;
      case 'gt': return value > compareValue;
      case 'gte': return value >= compareValue;
      case 'lt': return value < compareValue;
      case 'lte': return value <= compareValue;
      case 'contains': return String(value).includes(compareValue);
      case 'startsWith': return String(value).startsWith(compareValue);
      case 'endsWith': return String(value).endsWith(compareValue);
      case 'regex': return new RegExp(compareValue).test(String(value));
      case 'in': return Array.isArray(compareValue) && compareValue.includes(value);
      default: return value === compareValue;
    }
  }
  
  sortData(data, sortBy, sortOrder) {
    return [...data].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      
      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      if (aVal > bVal) comparison = 1;
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }
}

/**
 * Data Filter Operation - Filter data based on conditions
 */
export class DataFilterOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'DataFilterOperation';
    this.description = 'Filter data based on complex conditions and rules';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['filter-data', 'data-processing', 'data-cleansing'];
    this.supportedContainers = ['data-container', 'any'];
    this.capabilities = ['data-filtering', 'data-processing', 'rule-engine'];
    
    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'low'
    };
    
    this.requiredParameters = ['data'];
    this.optionalParameters = {
      filters: [],
      filterLogic: 'and', // and, or, custom
      includeEmpty: false,
      caseSensitive: false,
      maxResults: 0,
      sortBy: '',
      sortOrder: 'asc',
      uniqueField: '',
      customFilter: null,
      excludeFields: [],
      includeFields: [],
      sampleSize: 0
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
    this.log('info', 'Starting data filtering', { 
      itemCount: Array.isArray(finalParams.data) ? finalParams.data.length : 1,
      filtersCount: finalParams.filters.length 
    });
    
    try {
      let filteredData = Array.isArray(finalParams.data) ? [...finalParams.data] : [finalParams.data];
      const originalCount = filteredData.length;
      
      // Apply field selection
      if (finalParams.includeFields.length > 0 || finalParams.excludeFields.length > 0) {
        filteredData = this.selectFields(filteredData, finalParams.includeFields, finalParams.excludeFields);
      }
      
      // Apply filters
      if (finalParams.filters.length > 0) {
        filteredData = this.applyFilters(filteredData, finalParams.filters, finalParams.filterLogic, finalParams.caseSensitive);
      }
      
      // Apply custom filter if provided
      if (finalParams.customFilter && typeof finalParams.customFilter === 'function') {
        filteredData = filteredData.filter(finalParams.customFilter);
      }
      
      // Remove empty items if requested
      if (!finalParams.includeEmpty) {
        filteredData = this.removeEmptyItems(filteredData);
      }
      
      // Ensure uniqueness if requested
      if (finalParams.uniqueField) {
        filteredData = this.ensureUnique(filteredData, finalParams.uniqueField);
      }
      
      // Sort results
      if (finalParams.sortBy) {
        filteredData = this.sortData(filteredData, finalParams.sortBy, finalParams.sortOrder);
      }
      
      // Apply sampling if requested
      if (finalParams.sampleSize > 0 && finalParams.sampleSize < filteredData.length) {
        filteredData = this.sampleData(filteredData, finalParams.sampleSize);
      }
      
      // Limit results
      if (finalParams.maxResults > 0) {
        filteredData = filteredData.slice(0, finalParams.maxResults);
      }
      
      const result = {
        data: filteredData,
        metadata: {
          originalCount,
          filteredCount: filteredData.length,
          filterLogic: finalParams.filterLogic,
          filters: finalParams.filters,
          uniqueField: finalParams.uniqueField,
          sortBy: finalParams.sortBy,
          sortOrder: finalParams.sortOrder
        }
      };
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Data filtering completed', { 
        originalCount,
        filteredCount: filteredData.length,
        executionTime 
      });
      
      return {
        success: true,
        result,
        metadata: {
          executionTime,
          processingStats: result.metadata
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Data filtering failed', { error: error.message, executionTime });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          executionTime
        }
      };
    }
  }
  
  selectFields(data, includeFields, excludeFields) {
    return data.map(item => {
      const result = {};
      
      if (includeFields.length > 0) {
        for (const field of includeFields) {
          if (item[field] !== undefined) {
            result[field] = item[field];
          }
        }
      } else {
        Object.assign(result, item);
      }
      
      if (excludeFields.length > 0) {
        for (const field of excludeFields) {
          delete result[field];
        }
      }
      
      return result;
    });
  }
  
  applyFilters(data, filters, logic, caseSensitive) {
    return data.filter(item => this.matchesFilterConditions(item, filters, logic, caseSensitive));
  }
  
  matchesFilterConditions(item, filters, logic, caseSensitive) {
    if (logic === 'and') {
      return filters.every(filter => this.matchesSingleCondition(item, filter, caseSensitive));
    } else if (logic === 'or') {
      return filters.some(filter => this.matchesSingleCondition(item, filter, caseSensitive));
    } else {
      // Custom logic would be implemented here
      return filters.every(filter => this.matchesSingleCondition(item, filter, caseSensitive));
    }
  }
  
  matchesSingleCondition(item, filter, caseSensitive) {
    const { field, operator, value, type = 'string' } = filter;
    const itemValue = item[field];
    
    if (itemValue === undefined || itemValue === null) {
      return false;
    }
    
    let compareValue = value;
    let compareItemValue = itemValue;
    
    // Type conversion
    if (type === 'number') {
      compareItemValue = Number(itemValue);
      compareValue = Number(value);
    } else if (type === 'string' && !caseSensitive) {
      compareItemValue = String(itemValue).toLowerCase();
      compareValue = String(value).toLowerCase();
    } else {
      compareItemValue = String(itemValue);
      compareValue = String(value);
    }
    
    switch (operator) {
      case 'eq': return compareItemValue === compareValue;
      case 'ne': return compareItemValue !== compareValue;
      case 'gt': return compareItemValue > compareValue;
      case 'gte': return compareItemValue >= compareValue;
      case 'lt': return compareItemValue < compareValue;
      case 'lte': return compareItemValue <= compareValue;
      case 'contains': return compareItemValue.includes(compareValue);
      case 'notContains': return !compareItemValue.includes(compareValue);
      case 'startsWith': return compareItemValue.startsWith(compareValue);
      case 'endsWith': return compareItemValue.endsWith(compareValue);
      case 'regex': return new RegExp(compareValue).test(compareItemValue);
      case 'in': return Array.isArray(compareValue) && compareValue.includes(compareItemValue);
      case 'notIn': return Array.isArray(compareValue) && !compareValue.includes(compareItemValue);
      case 'exists': return itemValue !== undefined && itemValue !== null;
      case 'notExists': return itemValue === undefined || itemValue === null;
      case 'empty': return itemValue === '' || itemValue === null || itemValue === undefined;
      case 'notEmpty': return itemValue !== '' && itemValue !== null && itemValue !== undefined;
      default: return false;
    }
  }
  
  removeEmptyItems(data) {
    return data.filter(item => {
      if (typeof item === 'object' && item !== null) {
        return Object.keys(item).length > 0;
      }
      return item !== null && item !== undefined && item !== '';
    });
  }
  
  ensureUnique(data, field) {
    const seen = new Set();
    return data.filter(item => {
      const value = item[field];
      const key = value !== undefined ? String(value) : 'undefined';
      
      if (seen.has(key)) {
        return false;
      }
      
      seen.add(key);
      return true;
    });
  }
  
  sortData(data, sortBy, sortOrder) {
    return [...data].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      
      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      if (aVal > bVal) comparison = 1;
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }
  
  sampleData(data, sampleSize) {
    const shuffled = [...data].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, sampleSize);
  }
}

/**
 * Data Transformer Operation - Transform data structures
 */
export class DataTransformerOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'DataTransformerOperation';
    this.description = 'Transform data structures with mapping and conversion rules';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['transform-data', 'data-processing', 'data-conversion'];
    this.supportedContainers = ['data-container', 'any'];
    this.capabilities = ['data-transformation', 'data-mapping', 'data-conversion'];
    
    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'low'
    };
    
    this.requiredParameters = ['data'];
    this.optionalParameters = {
      fieldMapping: {},
      fieldTransformations: {},
      addFields: {},
      removeFields: [],
      groupBy: '',
      aggregations: {},
      flattenArrays: false,
      arraySeparator: ',',
      dateFormat: 'YYYY-MM-DD',
      numberFormat: 'decimal',
      stringCase: 'original', // uppercase, lowercase, original
      trimStrings: true,
      nullHandling: 'keep', // keep, remove, replace
      nullReplacement: '',
      validationRules: {},
      outputFormat: 'array', // array, object, csv, json
      includeMetadata: false
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
    this.log('info', 'Starting data transformation', { 
      itemCount: Array.isArray(finalParams.data) ? finalParams.data.length : 1,
      transformations: Object.keys(finalParams.fieldTransformations).length 
    });
    
    try {
      let transformedData = Array.isArray(finalParams.data) ? [...finalParams.data] : [finalParams.data];
      const originalCount = transformedData.length;
      
      // Apply field mapping
      if (Object.keys(finalParams.fieldMapping).length > 0) {
        transformedData = this.applyFieldMapping(transformedData, finalParams.fieldMapping);
      }
      
      // Apply field transformations
      if (Object.keys(finalParams.fieldTransformations).length > 0) {
        transformedData = this.applyFieldTransformations(transformedData, finalParams.fieldTransformations);
      }
      
      // Add new fields
      if (Object.keys(finalParams.addFields).length > 0) {
        transformedData = this.addNewFields(transformedData, finalParams.addFields);
      }
      
      // Remove fields
      if (finalParams.removeFields.length > 0) {
        transformedData = this.removeFields(transformedData, finalParams.removeFields);
      }
      
      // Apply string transformations
      transformedData = this.applyStringTransformations(transformedData, finalParams);
      
      // Handle null values
      transformedData = this.handleNullValues(transformedData, finalParams.nullHandling, finalParams.nullReplacement);
      
      // Flatten arrays if requested
      if (finalParams.flattenArrays) {
        transformedData = this.flattenArrays(transformedData, finalParams.arraySeparator);
      }
      
      // Apply group by and aggregations
      if (finalParams.groupBy && Object.keys(finalParams.aggregations).length > 0) {
        transformedData = this.applyGroupBy(transformedData, finalParams.groupBy, finalParams.aggregations);
      }
      
      // Apply validation rules
      if (Object.keys(finalParams.validationRules).length > 0) {
        transformedData = this.applyValidation(transformedData, finalParams.validationRules);
      }
      
      // Convert to output format
      if (finalParams.outputFormat !== 'array') {
        transformedData = this.convertToFormat(transformedData, finalParams.outputFormat);
      }
      
      const result = {
        data: transformedData,
        metadata: {
          originalCount,
          transformedCount: Array.isArray(transformedData) ? transformedData.length : 1,
          fieldMappings: Object.keys(finalParams.fieldMapping),
          transformations: Object.keys(finalParams.fieldTransformations),
          outputFormat: finalParams.outputFormat,
          grouped: !!finalParams.groupBy
        }
      };
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Data transformation completed', { 
        originalCount,
        transformedCount: Array.isArray(transformedData) ? transformedData.length : 1,
        executionTime 
      });
      
      return {
        success: true,
        result,
        metadata: {
          executionTime,
          processingStats: result.metadata
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Data transformation failed', { error: error.message, executionTime });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          executionTime
        }
      };
    }
  }
  
  applyFieldMapping(data, fieldMapping) {
    return data.map(item => {
      const result = {};
      
      for (const [oldField, newField] of Object.entries(fieldMapping)) {
        if (item[oldField] !== undefined) {
          result[newField] = item[oldField];
        }
      }
      
      // Keep unmapped fields
      for (const [key, value] of Object.entries(item)) {
        if (!fieldMapping[key]) {
          result[key] = value;
        }
      }
      
      return result;
    });
  }
  
  applyFieldTransformations(data, transformations) {
    return data.map(item => {
      const result = { ...item };
      
      for (const [field, transformation] of Object.entries(transformations)) {
        if (result[field] !== undefined) {
          result[field] = this.applyTransformation(result[field], transformation);
        }
      }
      
      return result;
    });
  }
  
  applyTransformation(value, transformation) {
    if (typeof transformation === 'function') {
      return transformation(value);
    }
    
    if (typeof transformation === 'string') {
      switch (transformation) {
        case 'uppercase':
          return String(value).toUpperCase();
        case 'lowercase':
          return String(value).toLowerCase();
        case 'capitalize':
          return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
        case 'trim':
          return String(value).trim();
        case 'number':
          return Number(value);
        case 'integer':
          return Math.floor(Number(value));
        case 'float':
          return parseFloat(value);
        case 'boolean':
          return Boolean(value);
        case 'string':
          return String(value);
        case 'json':
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        default:
          return value;
      }
    }
    
    return value;
  }
  
  addNewFields(data, newFields) {
    return data.map(item => {
      const result = { ...item };
      
      for (const [fieldName, fieldConfig] of Object.entries(newFields)) {
        if (typeof fieldConfig === 'function') {
          result[fieldName] = fieldConfig(item);
        } else if (typeof fieldConfig === 'object' && fieldConfig.value !== undefined) {
          result[fieldName] = fieldConfig.value;
        } else {
          result[fieldName] = fieldConfig;
        }
      }
      
      return result;
    });
  }
  
  removeFields(data, fieldsToRemove) {
    return data.map(item => {
      const result = { ...item };
      
      for (const field of fieldsToRemove) {
        delete result[field];
      }
      
      return result;
    });
  }
  
  applyStringTransformations(data, params) {
    return data.map(item => {
      const result = { ...item };
      
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'string') {
          let transformed = value;
          
          // Apply case transformation
          if (params.stringCase === 'uppercase') {
            transformed = transformed.toUpperCase();
          } else if (params.stringCase === 'lowercase') {
            transformed = transformed.toLowerCase();
          }
          
          // Apply trim
          if (params.trimStrings) {
            transformed = transformed.trim();
          }
          
          result[key] = transformed;
        }
      }
      
      return result;
    });
  }
  
  handleNullValues(data, nullHandling, nullReplacement) {
    return data.map(item => {
      const result = {};
      
      for (const [key, value] of Object.entries(item)) {
        if (value === null || value === undefined) {
          switch (nullHandling) {
            case 'remove':
              // Skip this field
              break;
            case 'replace':
              result[key] = nullReplacement;
              break;
            case 'keep':
            default:
              result[key] = value;
          }
        } else {
          result[key] = value;
        }
      }
      
      return result;
    });
  }
  
  flattenArrays(data, separator) {
    return data.map(item => {
      const result = {};
      
      for (const [key, value] of Object.entries(item)) {
        if (Array.isArray(value)) {
          result[key] = value.join(separator);
        } else {
          result[key] = value;
        }
      }
      
      return result;
    });
  }
  
  applyGroupBy(data, groupBy, aggregations) {
    const groups = new Map();
    
    // Group data
    for (const item of data) {
      const groupKey = item[groupBy];
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      
      groups.get(groupKey).push(item);
    }
    
    // Apply aggregations
    const result = [];
    
    for (const [groupKey, items] of groups) {
      const aggregated = { [groupBy]: groupKey };
      
      for (const [field, aggregation] of Object.entries(aggregations)) {
        const values = items.map(item => item[field]).filter(v => v !== undefined);
        
        switch (aggregation) {
          case 'sum':
            aggregated[field] = values.reduce((sum, val) => sum + Number(val), 0);
            break;
          case 'avg':
            aggregated[field] = values.reduce((sum, val) => sum + Number(val), 0) / values.length;
            break;
          case 'count':
            aggregated[field] = values.length;
            break;
          case 'min':
            aggregated[field] = Math.min(...values.map(Number));
            break;
          case 'max':
            aggregated[field] = Math.max(...values.map(Number));
            break;
          case 'first':
            aggregated[field] = values[0];
            break;
          case 'last':
            aggregated[field] = values[values.length - 1];
            break;
          case 'join':
            aggregated[field] = values.join(', ');
            break;
          default:
            aggregated[field] = values;
        }
      }
      
      result.push(aggregated);
    }
    
    return result;
  }
  
  applyValidation(data, validationRules) {
    return data.filter(item => {
      for (const [field, rules] of Object.entries(validationRules)) {
        const value = item[field];
        
        for (const rule of rules) {
          if (!this.validateField(value, rule)) {
            return false;
          }
        }
      }
      return true;
    });
  }
  
  validateField(value, rule) {
    const { type, required, min, max, pattern, enum: enumValues } = rule;
    
    // Check required
    if (required && (value === undefined || value === null || value === '')) {
      return false;
    }
    
    // Skip validation if not required and value is empty
    if (!required && (value === undefined || value === null || value === '')) {
      return true;
    }
    
    // Type validation
    if (type) {
      switch (type) {
        case 'string':
          if (typeof value !== 'string') return false;
          break;
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) return false;
          break;
        case 'integer':
          if (!Number.isInteger(value)) return false;
          break;
        case 'boolean':
          if (typeof value !== 'boolean') return false;
          break;
        case 'array':
          if (!Array.isArray(value)) return false;
          break;
        case 'object':
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          break;
      }
    }
    
    // Min/max validation
    if (min !== undefined) {
      if (typeof value === 'string' && value.length < min) return false;
      if (typeof value === 'number' && value < min) return false;
      if (Array.isArray(value) && value.length < min) return false;
    }
    
    if (max !== undefined) {
      if (typeof value === 'string' && value.length > max) return false;
      if (typeof value === 'number' && value > max) return false;
      if (Array.isArray(value) && value.length > max) return false;
    }
    
    // Pattern validation
    if (pattern && typeof value === 'string') {
      const regex = new RegExp(pattern);
      if (!regex.test(value)) return false;
    }
    
    // Enum validation
    if (enumValues && Array.isArray(enumValues)) {
      if (!enumValues.includes(value)) return false;
    }
    
    return true;
  }
  
  convertToFormat(data, format) {
    switch (format) {
      case 'object':
        return data.length === 1 ? data[0] : { items: data };
      case 'csv':
        return this.convertToCSV(data);
      case 'json':
        return JSON.stringify(data, null, 2);
      default:
        return data;
    }
  }
  
  convertToCSV(data) {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(item => {
      return headers.map(header => {
        const value = item[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });
    
    return [csvHeaders, ...csvRows].join('\n');
  }
}

/**
 * Markdown Converter Operation - Convert data to Markdown format
 */
export class MarkdownConverterOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'MarkdownConverterOperation';
    this.description = 'Convert data to Markdown format with customizable templates';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['convert-markdown', 'data-processing', 'format-conversion'];
    this.supportedContainers = ['data-container', 'any'];
    this.capabilities = ['markdown-generation', 'data-conversion', 'formatting'];
    
    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'low'
    };
    
    this.requiredParameters = ['data'];
    this.optionalParameters = {
      template: 'default', // default, table, list, custom
      customTemplate: '',
      title: '',
      description: '',
      includeHeaders: true,
      includeMetadata: true,
      tableAlignment: 'left', // left, center, right
      listStyle: '-', // -, *, 1.
      maxItemsPerSection: 50,
      groupBy: '',
      dateFormat: 'YYYY-MM-DD HH:mm:ss',
      numberFormat: 'decimal',
      imageBasePath: '',
      linkFormat: '[text](url)',
      codeBlockLanguage: '',
      frontmatter: {},
      sections: []
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
    this.log('info', 'Starting Markdown conversion', { 
      itemCount: Array.isArray(finalParams.data) ? finalParams.data.length : 1,
      template: finalParams.template 
    });
    
    try {
      const data = Array.isArray(finalParams.data) ? finalParams.data : [finalParams.data];
      
      let markdown = '';
      
      // Add frontmatter if provided
      if (Object.keys(finalParams.frontmatter).length > 0) {
        markdown += this.generateFrontmatter(finalParams.frontmatter) + '\n\n';
      }
      
      // Add title and description
      if (finalParams.title) {
        markdown += `# ${finalParams.title}\n\n`;
      }
      
      if (finalParams.description) {
        markdown += `${finalParams.description}\n\n`;
      }
      
      // Generate content based on template
      switch (finalParams.template) {
        case 'table':
          markdown += this.generateTable(data, finalParams);
          break;
        case 'list':
          markdown += this.generateList(data, finalParams);
          break;
        case 'custom':
          markdown += this.generateCustomTemplate(data, finalParams);
          break;
        case 'default':
        default:
          markdown += this.generateDefaultFormat(data, finalParams);
          break;
      }
      
      // Add metadata if requested
      if (finalParams.includeMetadata) {
        markdown += this.generateMetadata(data, finalParams);
      }
      
      const result = {
        markdown: markdown.trim(),
        metadata: {
          template: finalParams.template,
          itemCount: data.length,
          characterCount: markdown.length,
          generatedAt: new Date().toISOString(),
          hasFrontmatter: Object.keys(finalParams.frontmatter).length > 0
        }
      };
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Markdown conversion completed', { 
        characterCount: markdown.length,
        executionTime 
      });
      
      return {
        success: true,
        result,
        metadata: {
          executionTime,
          outputStats: result.metadata
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Markdown conversion failed', { error: error.message, executionTime });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          executionTime
        }
      };
    }
  }
  
  generateFrontmatter(frontmatter) {
    const yaml = Object.entries(frontmatter)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        } else if (Array.isArray(value)) {
          return `${key}:\n${value.map(v => `  - "${v}"`).join('\n')}`;
        } else if (typeof value === 'object') {
          return `${key}:\n${Object.entries(value)
            .map(([k, v]) => `  ${k}: "${v}"`)
            .join('\n')}`;
        } else {
          return `${key}: ${value}`;
        }
      })
      .join('\n');
    
    return `---\n${yaml}\n---`;
  }
  
  generateTable(data, params) {
    if (data.length === 0) return 'No data to display';
    
    const headers = Object.keys(data[0]);
    const alignments = this.getTableAlignments(headers, params.tableAlignment);
    
    let markdown = '';
    
    // Headers
    markdown += '| ' + headers.join(' | ') + ' |\n';
    
    // Alignment
    markdown += '| ' + alignments.map(a => a + ' |').join('') + '\n';
    
    // Data rows
    for (const item of data) {
      const row = headers.map(header => {
        const value = item[header];
        return this.formatTableCell(value, params);
      });
      markdown += '| ' + row.join(' | ') + ' |\n';
    }
    
    return markdown;
  }
  
  getTableAlignments(headers, alignment) {
    const alignmentMap = {
      'left': ':---',
      'center': ':---:',
      'right': '---:'
    };
    
    return headers.map(() => alignmentMap[alignment] || ':---');
  }
  
  formatTableCell(value, params) {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'string') {
      // Escape pipe characters
      return value.replace(/\|/g, '\\|');
    }
    
    if (typeof value === 'number') {
      return this.formatNumber(value, params.numberFormat);
    }
    
    if (value instanceof Date) {
      return this.formatDate(value, params.dateFormat);
    }
    
    if (Array.isArray(value)) {
      return value.map(v => this.formatTableCell(v, params)).join(', ');
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  }
  
  generateList(data, params) {
    if (data.length === 0) return 'No data to display';
    
    let markdown = '';
    
    if (params.groupBy && data.length > 0) {
      // Group by field
      const groups = this.groupData(data, params.groupBy);
      
      for (const [groupKey, items] of groups) {
        markdown += `## ${groupKey}\n\n`;
        markdown += this.generateItemList(items, params);
        markdown += '\n';
      }
    } else {
      markdown += this.generateItemList(data, params);
    }
    
    return markdown;
  }
  
  generateItemList(items, params) {
    const style = params.listStyle;
    let markdown = '';
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const prefix = style === '1.' ? `${i + 1}.` : style;
      
      const itemContent = this.formatListItem(item, params);
      markdown += `${prefix} ${itemContent}\n`;
    }
    
    return markdown;
  }
  
  formatListItem(item, params) {
    const content = [];
    
    for (const [key, value] of Object.entries(item)) {
      if (params.includeHeaders) {
        content.push(`**${key}**: ${this.formatValue(value, params)}`);
      } else {
        content.push(this.formatValue(value, params));
      }
    }
    
    return content.join(' | ');
  }
  
  generateCustomTemplate(data, params) {
    if (!params.customTemplate) {
      return this.generateDefaultFormat(data, params);
    }
    
    let markdown = '';
    
    for (const item of data) {
      let itemMarkdown = params.customTemplate;
      
      // Replace template variables
      for (const [key, value] of Object.entries(item)) {
        const placeholder = `{{${key}}}`;
        const formattedValue = this.formatValue(value, params);
        itemMarkdown = itemMarkdown.replace(new RegExp(placeholder, 'g'), formattedValue);
      }
      
      markdown += itemMarkdown + '\n';
    }
    
    return markdown;
  }
  
  generateDefaultFormat(data, params) {
    let markdown = '';
    
    if (params.sections.length > 0) {
      // Use custom sections
      for (const section of params.sections) {
        markdown += this.generateSection(data, section, params);
      }
    } else {
      // Default format: sections for different data types
      markdown += this.generateSummarySection(data, params);
      markdown += this.generateDataSection(data, params);
    }
    
    return markdown;
  }
  
  generateSummarySection(data, params) {
    if (data.length === 0) return '';
    
    const summary = this.generateDataSummary(data);
    let markdown = '## Summary\n\n';
    
    for (const [key, value] of Object.entries(summary)) {
      markdown += `- **${key}**: ${value}\n`;
    }
    
    markdown += '\n';
    return markdown;
  }
  
  generateDataSection(data, params) {
    if (data.length === 0) return '';
    
    let markdown = '## Data\n\n';
    
    if (data.length <= params.maxItemsPerSection) {
      // Show all items
      markdown += this.generateTable(data, params);
    } else {
      // Show sample and summary
      const sample = data.slice(0, params.maxItemsPerSection);
      markdown += `Showing ${sample.length} of ${data.length} items:\n\n`;
      markdown += this.generateTable(sample, params);
    }
    
    return markdown;
  }
  
  generateSection(data, section, params) {
    let markdown = '';
    
    if (section.title) {
      markdown += `## ${section.title}\n\n`;
    }
    
    if (section.description) {
      markdown += `${section.description}\n\n`;
    }
    
    const sectionData = this.filterSectionData(data, section);
    
    switch (section.format) {
      case 'table':
        markdown += this.generateTable(sectionData, params);
        break;
      case 'list':
        markdown += this.generateList(sectionData, params);
        break;
      case 'code':
        markdown += this.generateCodeBlock(sectionData, params);
        break;
      default:
        markdown += this.generateTable(sectionData, params);
    }
    
    markdown += '\n';
    return markdown;
  }
  
  filterSectionData(data, section) {
    if (section.filter) {
      return data.filter(section.filter);
    }
    
    if (section.fields) {
      return data.map(item => {
        const result = {};
        for (const field of section.fields) {
          if (item[field] !== undefined) {
            result[field] = item[field];
          }
        }
        return result;
      });
    }
    
    return data;
  }
  
  generateCodeBlock(data, params) {
    const language = params.codeBlockLanguage || 'json';
    const code = JSON.stringify(data, null, 2);
    return `\`\`\`${language}\n${code}\n\`\`\``;
  }
  
  generateMetadata(data, params) {
    const metadata = {
      generatedAt: new Date().toISOString(),
      itemCount: data.length,
      fields: data.length > 0 ? Object.keys(data[0]) : [],
      template: params.template
    };
    
    let markdown = '---\n\n## Metadata\n\n';
    
    for (const [key, value] of Object.entries(metadata)) {
      markdown += `- **${key}**: ${Array.isArray(value) ? value.join(', ') : value}\n`;
    }
    
    return markdown;
  }
  
  formatValue(value, params) {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'string') {
      // Check if it's a URL
      if (value.startsWith('http://') || value.startsWith('https://')) {
        return params.linkFormat.replace('text', value).replace('url', value);
      }
      return value;
    }
    
    if (typeof value === 'number') {
      return this.formatNumber(value, params.numberFormat);
    }
    
    if (value instanceof Date) {
      return this.formatDate(value, params.dateFormat);
    }
    
    if (Array.isArray(value)) {
      return value.map(v => this.formatValue(v, params)).join(', ');
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
  
  formatDate(date, format) {
    if (format === 'ISO') {
      return date.toISOString();
    }
    
    // Simple format for now, could be expanded with proper date formatting library
    return date.toLocaleDateString();
  }
  
  groupData(data, groupBy) {
    const groups = new Map();
    
    for (const item of data) {
      const key = item[groupBy];
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      
      groups.get(key).push(item);
    }
    
    return groups;
  }
  
  generateDataSummary(data) {
    if (data.length === 0) return {};
    
    const summary = {
      'Total Items': data.length,
      'Fields': Object.keys(data[0]).length
    };
    
    // Add field summaries
    const fields = Object.keys(data[0]);
    for (const field of fields) {
      const values = data.map(item => item[field]).filter(v => v !== null && v !== undefined);
      
      if (values.length > 0) {
        const uniqueValues = new Set(values);
        summary[`${field} (unique)`] = uniqueValues.size;
        
        if (typeof values[0] === 'number') {
          summary[`${field} (avg)`] = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
          summary[`${field} (min)`] = Math.min(...values);
          summary[`${field} (max)`] = Math.max(...values);
        }
      }
    }
    
    return summary;
  }
}