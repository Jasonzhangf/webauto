/**
 * 微博搜索结果工作流
 * 基于 BaseWorkflow 和原子操作子模式
 */

const BaseWorkflow = require('../core/base-workflow.js.cjs');
const BaseAtomicOperation = require('../core/atomic-operations/base-atomic-operation.js.cjs');
const {
  NavigateOperation,
  WaitForNavigationOperation
} = require('../core/atomic-operations/navigation-operations.js.cjs');

/**
 * 微博搜索结果工作流
 * 提取搜索结果的帖子和相关推荐
 */
class WeiboSearchWorkflow extends BaseWorkflow {
  constructor(config = {}) {
    super({
      name: 'weibo-search',
      version: '1.0.0',
      description: '微博搜索结果帖子提取工作流',
      timeout: 120000,
      maxRetries: 3,
      category: 'weibo',
      maxResults: 100,
      includeRelated: true,
      sortBy: 'recent', // recent, hot
      timeRange: 'all', // all, day, week, month
      ...config
    });
  }

  /**
   * 注册原子操作
   */
  async registerAtomicOperations() {
    console.log('📝 注册微博搜索原子操作...');

    // 导航相关操作
    this.registerAtomicOperation('navigate', new NavigateOperation({
      timeout: this.config.timeout
    }));

    this.registerAtomicOperation('waitForNavigation', new WaitForNavigationOperation({
      timeout: this.config.timeout
    }));

    // 微博搜索专用操作
    this.registerAtomicOperation('performSearch', new PerformSearchOperation({
      timeout: this.config.timeout
    }));

    // 搜索结果提取操作
    this.registerAtomicOperation('extractSearchResults', new ExtractSearchResultsOperation({
      maxResults: this.config.maxResults
    }));

    this.registerAtomicOperation('extractSearchFilters', new ExtractSearchFiltersOperation());

    this.registerAtomicOperation('applySearchFilters', new ApplySearchFiltersOperation());

    // 相关搜索操作
    this.registerAtomicOperation('extractRelatedSearch', new ExtractRelatedSearchOperation());

    this.registerAtomicOperation('extractSearchSuggestions', new ExtractSearchSuggestionsOperation());

    // 排序和筛选操作
    this.registerAtomicOperation('changeSortOrder', new ChangeSortOrderOperation());

    this.registerAtomicOperation('changeTimeRange', new ChangeTimeRangeOperation());

    // 分页操作
    this.registerAtomicOperation('navigateSearchPage', new NavigateSearchPageOperation());

    this.registerAtomicOperation('loadMoreResults', new LoadMoreResultsOperation());

    // 验证操作
    this.registerAtomicOperation('validateSearch', new ValidateSearchOperation());

    this.registerAtomicOperation('validateResults', new ValidateResultsOperation());

    console.log('✅ 微博搜索原子操作注册完成');
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(options = {}) {
    console.log('🔧 开始执行微博搜索工作流...');

    const keyword = options.keyword || this.config.keyword;
    if (!keyword) {
      throw new Error('缺少搜索关键词参数');
    }

    const results = {
      keyword: keyword,
      searchResults: [],
      relatedSearches: [],
      searchFilters: {},
      searchMetadata: {
        workflowName: this.config.name,
        version: this.config.version,
        keyword: keyword,
        extractedAt: new Date().toISOString(),
        totalResults: 0,
        executionTime: 0,
        searchOptions: {
          sortBy: options.sortBy || this.config.sortBy,
          timeRange: options.timeRange || this.config.timeRange,
          maxResults: options.maxResults || this.config.maxResults
        }
      }
    };

    try {
      // 步骤1: 执行搜索
      await this.stepPerformSearch(keyword, options);

      // 步骤2: 验证搜索结果页面
      await this.stepValidateSearch();

      // 步骤3: 应用搜索筛选
      await this.stepApplySearchFilters(options);

      // 步骤4: 提取搜索结果
      await this.stepExtractSearchResults(results);

      // 步骤5: 加载更多结果
      await this.stepLoadMoreResults(results);

      // 步骤6: 提取相关信息
      if (this.config.includeRelated) {
        await this.stepExtractRelatedInfo(results);
      }

      // 步骤7: 验证结果
      await this.stepValidateResults(results);

      // 步骤8: 处理和保存数据
      await this.stepProcessResults(results);

      console.log(`✅ 微博搜索工作流执行完成，共提取 ${results.searchResults.length} 条结果`);

      return results;

    } catch (error) {
      console.error('❌ 微博搜索工作流执行失败:', error);
      throw error;
    }
  }

  /**
   * 步骤1: 执行搜索
   */
  async stepPerformSearch(keyword, options) {
    console.log(`📋 步骤1: 执行搜索: ${keyword}`);

    const result = await this.executeAtomicOperation('performSearch', {
      keyword: keyword,
      options: {
        sortBy: options.sortBy || this.config.sortBy,
        timeRange: options.timeRange || this.config.timeRange,
        waitForContent: true
      }
    });

    this.setSharedData('keyword', keyword);
    this.setSharedData('searchResult', result);
    return result;
  }

  /**
   * 步骤2: 验证搜索结果页面
   */
  async stepValidateSearch() {
    console.log('📋 步骤2: 验证搜索结果页面...');

    const result = await this.executeAtomicOperation('validateSearch');

    if (!result.success) {
      throw new Error('搜索结果页面验证失败');
    }

    this.setSharedData('searchValidation', result);
    return result;
  }

  /**
   * 步骤3: 应用搜索筛选
   */
  async stepApplySearchFilters(options) {
    console.log('📋 步骤3: 应用搜索筛选...');

    // 提取可用的筛选器
    const filtersResult = await this.executeAtomicOperation('extractSearchFilters');
    this.setSharedData('availableFilters', filtersResult.result);

    // 应用排序选项
    if (options.sortBy && options.sortBy !== this.config.sortBy) {
      await this.executeAtomicOperation('changeSortOrder', {
        sortBy: options.sortBy
      });
    }

    // 应用时间范围
    if (options.timeRange && options.timeRange !== this.config.timeRange) {
      await this.executeAtomicOperation('changeTimeRange', {
        timeRange: options.timeRange
      });
    }

    return filtersResult.result;
  }

  /**
   * 步骤4: 提取搜索结果
   */
  async stepExtractSearchResults(results) {
    console.log('📋 步骤4: 提取搜索结果...');

    const searchResultsResult = await this.executeAtomicOperation('extractSearchResults');
    results.searchResults = searchResultsResult.result || [];

    // 提取搜索筛选器信息
    const filtersResult = await this.executeAtomicOperation('extractSearchFilters');
    results.searchFilters = filtersResult.result || {};

    this.setSharedData('searchResults', results.searchResults);
    return results.searchResults;
  }

  /**
   * 步骤5: 加载更多结果
   */
  async stepLoadMoreResults(results) {
    console.log('📋 步骤5: 加载更多结果...');

    const maxResults = this.config.maxResults || 100;
    let attempts = 0;
    const maxAttempts = 5;

    while (results.searchResults.length < maxResults && attempts < maxAttempts) {
      console.log(`🔄 当前结果数: ${results.searchResults.length}, 目标: ${maxResults}`);

      // 尝试加载更多
      const loadMoreResult = await this.executeAtomicOperation('loadMoreResults');

      if (!loadMoreResult.success) {
        // 尝试分页导航
        const pageResult = await this.executeAtomicOperation('navigateSearchPage', {
          direction: 'next'
        });

        if (!pageResult.success) {
          console.log('⚠️ 无法加载更多结果，停止加载');
          break;
        }
      }

      // 等待新内容加载
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 提取新增的结果
      const newResults = await this.extractNewSearchResults(results.searchResults);

      if (newResults.length > 0) {
        results.searchResults.push(...newResults);
        console.log(`📥 新增 ${newResults.length} 条搜索结果`);
      } else {
        console.log('⚠️ 未发现新结果，停止加载');
        break;
      }

      attempts++;
    }

    return results.searchResults;
  }

  /**
   * 步骤6: 提取相关信息
   */
  async stepExtractRelatedInfo(results) {
    console.log('📋 步骤6: 提取相关信息...');

    try {
      // 提取相关搜索
      const relatedResult = await this.executeAtomicOperation('extractRelatedSearch');
      results.relatedSearches = relatedResult.result || [];

      // 提取搜索建议
      const suggestionsResult = await this.executeAtomicOperation('extractSearchSuggestions');
      results.searchSuggestions = suggestionsResult.result || [];

      this.setSharedData('relatedInfo', {
        relatedSearches: results.relatedSearches,
        searchSuggestions: results.searchSuggestions
      });

      return {
        relatedSearches: results.relatedSearches,
        searchSuggestions: results.searchSuggestions
      };

    } catch (error) {
      console.warn('⚠️ 相关信息提取失败:', error.message);
      return {
        relatedSearches: [],
        searchSuggestions: []
      };
    }
  }

  /**
   * 步骤7: 验证结果
   */
  async stepValidateResults(results) {
    console.log('📋 步骤7: 验证搜索结果...');

    const validation = await this.executeAtomicOperation('validateResults', {
      searchResults: results.searchResults,
      keyword: results.keyword
    });

    if (!validation.success) {
      console.warn('⚠️ 搜索结果验证警告:', validation.warnings);
    }

    results.searchMetadata.validation = validation;
    return validation;
  }

  /**
   * 步骤8: 处理和保存数据
   */
  async stepProcessResults(results) {
    console.log('📋 步骤8: 处理和保存数据...');

    // 去重
    results.searchResults = this.removeDuplicates(results.searchResults);

    // 按相关性排序
    results.searchResults = this.sortByRelevance(results.searchResults, results.keyword);

    // 限制数量
    if (results.searchResults.length > this.config.maxResults) {
      results.searchResults = results.searchResults.slice(0, this.config.maxResults);
    }

    // 更新元数据
    results.searchMetadata.totalResults = results.searchResults.length;
    results.searchMetadata.extractedAt = new Date().toISOString();
    results.searchMetadata.executionTime = Date.now() - this.state.startTime;

    // 保存到共享数据
    this.setSharedData('finalResults', results);

    return results;
  }

  /**
   * 提取新的搜索结果
   */
  async extractNewSearchResults(existingResults) {
    const existingIds = new Set(existingResults.map(r => r.id));

    // 提取当前页面的所有结果
    const currentResults = await this.executeAtomicOperation('extractSearchResults');
    const allResults = currentResults.result || [];

    // 过滤出新结果
    const newResults = allResults.filter(result => !existingIds.has(result.id));

    return newResults;
  }

  /**
   * 去重
   */
  removeDuplicates(results) {
    const seen = new Set();
    return results.filter(result => {
      const key = result.id || result.url;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * 按相关性排序
   */
  sortByRelevance(results, keyword) {
    const keywordLower = keyword.toLowerCase();

    return results.sort((a, b) => {
      // 计算相关性分数
      const getRelevanceScore = (result) => {
        let score = 0;
        const content = (result.content + result.title + result.author).toLowerCase();

        // 关键词出现次数
        const keywordCount = (content.match(new RegExp(keywordLower, 'g')) || []).length;
        score += keywordCount * 10;

        // 标题匹配
        if (result.title && result.title.toLowerCase().includes(keywordLower)) {
          score += 20;
        }

        // 作者匹配
        if (result.author && result.author.toLowerCase().includes(keywordLower)) {
          score += 15;
        }

        // 热度/互动数据
        if (result.stats) {
          score += parseInt(result.stats.likes || 0) * 0.1;
          score += parseInt(result.stats.comments || 0) * 0.2;
          score += parseInt(result.stats.shares || 0) * 0.3;
        }

        return score;
      };

      const scoreA = getRelevanceScore(a);
      const scoreB = getRelevanceScore(b);

      return scoreB - scoreA;
    });
  }
}

// 微博搜索专用原子操作
class PerformSearchOperation extends BaseAtomicOperation {
  async execute(context, params) {
    const { keyword, options = {} } = params;

    console.log(`🔍 执行搜索: ${keyword}`);

    // 构建搜索URL
    const searchUrl = this.buildSearchUrl(keyword, options);

    // 导航到搜索页面
    await context.page.goto(searchUrl, {
      waitUntil: 'networkidle',
      timeout: this.config.timeout
    });

    // 等待搜索结果加载
    await this.waitForSearchResults(context.page, options);

    console.log('✅ 搜索执行完成');

    return {
      success: true,
      url: searchUrl,
      keyword: keyword,
      title: await context.page.title()
    };
  }

  buildSearchUrl(keyword, options) {
    const baseUrl = 'https://weibo.com/search';
    const params = new URLSearchParams({
      q: keyword,
      type: 'weibo'
    });

    if (options.sortBy) {
      params.set('sort', options.sortBy);
    }

    if (options.timeRange && options.timeRange !== 'all') {
      params.set('timescope', this.getTimeScope(options.timeRange));
    }

    return `${baseUrl}?${params.toString()}`;
  }

  getTimeScope(timeRange) {
    const scopes = {
      day: 'custom:1',
      week: 'custom:7',
      month: 'custom:30'
    };
    return scopes[timeRange] || '';
  }

  async waitForSearchResults(page, options) {
    const maxAttempts = options.maxScrollAttempts || 3;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        // 等待搜索结果元素
        await page.waitForSelector('[class*="search"], .search-results, .feed-item', {
          timeout: 5000,
          state: 'attached'
        });

        // 智能滚动
        await page.evaluate(() => {
          window.scrollTo(0, window.innerHeight / 2);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('✅ 搜索结果加载完成');
        return;

      } catch (error) {
        attempts++;
        console.log(`⚠️ 搜索结果加载尝试 ${attempts}/${maxAttempts}`);
      }
    }
  }
}

// 搜索结果提取原子操作
class ExtractSearchResultsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📥 提取搜索结果...');

    const results = await context.page.evaluate(() => {
      const resultElements = document.querySelectorAll('[class*="search"], .search-result, .feed-item');
      const results = [];

      resultElements.forEach((element, index) => {
        try {
          // 提取帖子链接
          const linkElement = element.querySelector('a[href*="/status/"]');
          const link = linkElement ? linkElement.href : '';

          // 提取标题
          const titleElement = element.querySelector('[class*="title"], h3, h4');
          const title = titleElement ? titleElement.textContent.trim() : '';

          // 提取内容
          const contentElement = element.querySelector('[class*="content"], .text, .feed-text');
          const content = contentElement ? contentElement.textContent.trim() : '';

          // 提取作者
          const authorElement = element.querySelector('[class*="author"], .username, .nickname');
          const author = authorElement ? authorElement.textContent.trim() : '';

          // 提取时间
          const timeElement = element.querySelector('[class*="time"], .timestamp, .date');
          const time = timeElement ? timeElement.textContent.trim() : '';

          // 提取互动数据
          const stats = this.extractStats(element);

          // 提取关键词匹配位置
          const keywordMatches = this.extractKeywordMatches(element);

          results.push({
            id: link ? link.match(/\/status\/(\d+)/)?.[1] || `result-${index}` : `result-${index}`,
            url: link,
            title: title,
            content: content.substring(0, 300),
            author: author,
            time: time,
            stats: stats,
            keywordMatches: keywordMatches,
            relevanceScore: this.calculateRelevanceScore(title, content, author),
            index: index
          });
        } catch (error) {
          console.warn(`搜索结果 ${index} 提取失败:`, error);
        }
      });

      return results;
    });

    console.log(`📥 找到 ${results.length} 条搜索结果`);

    return {
      success: true,
      result: results
    };
  }

  extractStats(element) {
    try {
      const statsElement = element.querySelector('[class*="stats"], .interaction');
      if (statsElement) {
        const text = statsElement.textContent;
        return {
          likes: this.extractNumber(text, ['赞', 'like']),
          comments: this.extractNumber(text, ['评论', 'comment']),
          shares: this.extractNumber(text, ['转发', 'share'])
        };
      }
      return {};
    } catch (error) {
      return {};
    }
  }

  extractNumber(text, keywords) {
    for (const keyword of keywords) {
      const match = text.match(new RegExp(`${keyword}\\s*[:：]?\\s*(\\d+)`));
      if (match) {
        return parseInt(match[1]);
      }
    }
    return 0;
  }

  extractKeywordMatches(element) {
    try {
      const highlights = element.querySelectorAll('mark, [class*="highlight"], strong');
      return Array.from(highlights).map(el => el.textContent.trim());
    } catch (error) {
      return [];
    }
  }

  calculateRelevanceScore(title, content, author) {
    let score = 0;
    const fullText = (title + content + author).toLowerCase();

    // 简单的相关性计算
    score += (title.match(/\w+/g) || []).length * 2;
    score += (content.match(/\w+/g) || []).length;
    score += (author.match(/\w+/g) || []).length * 3;

    return score;
  }
}

// 搜索筛选器操作
class ExtractSearchFiltersOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🔍 提取搜索筛选器...');

    const filters = await context.page.evaluate(() => {
      const filterData = {
        sort: [],
        timeRange: [],
        type: [],
        other: []
      };

      // 提取排序选项
      const sortElements = document.querySelectorAll('[class*="sort"], .sort-option');
      sortElements.forEach(el => {
        filterData.sort.push({
          name: el.textContent.trim(),
          value: el.getAttribute('data-value') || '',
          selected: el.classList.contains('active') || el.classList.contains('selected')
        });
      });

      // 提取时间范围选项
      const timeElements = document.querySelectorAll('[class*="time"], .time-option');
      timeElements.forEach(el => {
        filterData.timeRange.push({
          name: el.textContent.trim(),
          value: el.getAttribute('data-value') || '',
          selected: el.classList.contains('active') || el.classList.contains('selected')
        });
      });

      return filterData;
    });

    console.log(`📥 找到 ${filters.sort.length} 个排序选项, ${filters.timeRange.length} 个时间选项`);

    return {
      success: true,
      result: filters
    };
  }
}

// 更多原子操作的实现...
class ApplySearchFiltersOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🎯 应用搜索筛选器...');
    return { success: true, result: {} };
  }
}

class ExtractRelatedSearchOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🔗 提取相关搜索...');

    const related = await context.page.evaluate(() => {
      const relatedElements = document.querySelectorAll('[class*="related"], .related-search');
      return Array.from(relatedElements).map(el => el.textContent.trim());
    });

    return {
      success: true,
      result: related
    };
  }
}

class ExtractSearchSuggestionsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('💡 提取搜索建议...');

    const suggestions = await context.page.evaluate(() => {
      const suggestionElements = document.querySelectorAll('[class*="suggestion"], .autocomplete-item');
      return Array.from(suggestionElements).map(el => el.textContent.trim());
    });

    return {
      success: true,
      result: suggestions
    };
  }
}

class ChangeSortOrderOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log(`🔄 更改排序方式: ${params.sortBy}`);
    return { success: true, result: { sortBy: params.sortBy } };
  }
}

class ChangeTimeRangeOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log(`🔄 更改时间范围: ${params.timeRange}`);
    return { success: true, result: { timeRange: params.timeRange } };
  }
}

class NavigateSearchPageOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log(`📄 导航搜索页面: ${params.direction}`);
    return { success: true, result: { direction: params.direction } };
  }
}

class LoadMoreResultsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📜 加载更多搜索结果...');

    try {
      // 尝试点击加载更多按钮
      const loadMoreButton = await context.page.$('.load-more, .more-button, [class*="more"]');
      if (loadMoreButton) {
        await loadMoreButton.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { success: true };
      }

      // 尝试滚动加载
      await context.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

// 验证原子操作
class ValidateSearchOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🔍 验证搜索页面...');

    const title = await context.page.title();
    const url = context.page.url();

    // 检查是否包含错误信息
    if (title.includes('404') || title.includes('错误')) {
      return {
        success: false,
        message: `搜索页面错误: ${title}`
      };
    }

    // 检查是否有搜索结果
    const hasResults = await context.page.$('[class*="search"], .search-results, .feed-item');
    if (!hasResults) {
      return {
        success: false,
        message: '未找到搜索结果'
      };
    }

    return {
      success: true,
      url,
      title
    };
  }
}

class ValidateResultsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🔍 验证搜索结果...');

    const { searchResults, keyword } = params;
    const warnings = [];

    // 检查结果数量
    if (searchResults.length === 0) {
      warnings.push('未找到任何搜索结果');
    }

    // 检查结果数据完整性
    searchResults.forEach((result, index) => {
      if (!result.id) warnings.push(`搜索结果 ${index} 缺少ID`);
      if (!result.url) warnings.push(`搜索结果 ${index} 缺少URL`);
      if (!result.content) warnings.push(`搜索结果 ${index} 缺少内容`);
    });

    // 检查关键词相关性
    const keywordLower = keyword.toLowerCase();
    const relevantResults = searchResults.filter(result => {
      const text = (result.title + result.content + result.author).toLowerCase();
      return text.includes(keywordLower);
    });

    if (relevantResults.length < searchResults.length * 0.5) {
      warnings.push('部分结果与关键词相关性较低');
    }

    return {
      success: warnings.length === 0,
      warnings,
      validatedResults: searchResults.length,
      relevantResults: relevantResults.length
    };
  }
}

module.exports = {
  WeiboSearchWorkflow,
  WorkflowClass: WeiboSearchWorkflow,
  config: {
    name: 'weibo-search',
    version: '1.0.0',
    description: '微博搜索结果帖子提取工作流',
    category: 'weibo',
    maxResults: 100,
    includeRelated: true,
    sortBy: 'recent',
    timeRange: 'all',
    timeout: 120000,
    tags: ['weibo', 'search', 'extraction', 'keyword'],
    author: 'Weibo Workflow System'
  }
};