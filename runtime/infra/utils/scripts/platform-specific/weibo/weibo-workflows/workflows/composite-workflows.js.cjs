/**
 * 复合工作流
 * 组合多个基础工作流实现复杂功能
 */

const BaseWorkflow = require('../core/base-workflow.js.cjs');

/**
 * 微博完整扫描复合工作流
 * 组合主页、搜索、个人主页等多种工作流
 */
class WeiboCompleteScanWorkflow extends BaseWorkflow {
  constructor(config = {}) {
    super({
      name: 'weibo-complete-scan',
      version: '1.0.0',
      description: '微博完整扫描复合工作流',
      timeout: 300000,
      maxRetries: 2,
      category: 'composite',
      ...config
    });

    this.workflowConfigs = [
      {
        name: 'homepage',
        enabled: true,
        options: { maxPosts: 30 },
        priority: 1
      },
      {
        name: 'search',
        enabled: true,
        options: { keyword: '热门', maxResults: 20 },
        priority: 2
      },
      {
        name: 'profile',
        enabled: false,
        options: { profileUrl: '', maxPosts: 25 },
        priority: 3
      }
    ];
  }

  /**
   * 注册原子操作
   */
  async registerAtomicOperations() {
    console.log('📝 注册复合工作流原子操作...');

    // 复合工作流管理操作
    this.registerAtomicOperation('executeSubWorkflow', new ExecuteSubWorkflowOperation());

    // 结果聚合操作
    this.registerAtomicOperation('aggregateResults', new AggregateResultsOperation());

    // 数据分析操作
    this.registerAtomicOperation('analyzeResults', new AnalyzeResultsOperation());

    // 报告生成操作
    this.registerAtomicOperation('generateReport', new GenerateReportOperation());

    console.log('✅ 复合工作流原子操作注册完成');
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(options = {}) {
    console.log('🔧 开始执行微博完整扫描复合工作流...');

    const results = {
      workflowResults: {},
      aggregatedData: {},
      analysis: {},
      report: {},
      metadata: {
        workflowName: this.config.name,
        version: this.config.version,
        totalWorkflows: 0,
        completedWorkflows: 0,
        failedWorkflows: 0,
        executionTime: 0,
        extractedAt: new Date().toISOString()
      }
    };

    try {
      // 步骤1: 配置工作流
      await this.stepConfigureWorkflows(options);

      // 步骤2: 执行子工作流
      await this.stepExecuteSubWorkflows(results);

      // 步骤3: 聚合结果
      await this.stepAggregateResults(results);

      // 步骤4: 分析数据
      await this.stepAnalyzeResults(results);

      // 步骤5: 生成报告
      await this.stepGenerateReport(results);

      // 步骤6: 处理和保存数据
      await this.stepProcessResults(results);

      console.log(`✅ 微博完整扫描复合工作流执行完成`);

      return results;

    } catch (error) {
      console.error('❌ 微博完整扫描复合工作流执行失败:', error);
      throw error;
    }
  }

  /**
   * 步骤1: 配置工作流
   */
  async stepConfigureWorkflows(options) {
    console.log('📋 步骤1: 配置工作流...');

    // 更新工作流配置
    if (options.workflows) {
      this.workflowConfigs = options.workflows;
    }

    // 过滤启用的工作流
    this.enabledWorkflows = this.workflowConfigs.filter(w => w.enabled);

    // 按优先级排序
    this.enabledWorkflows.sort((a, b) => a.priority - b.priority);

    console.log(`📋 配置完成，将执行 ${this.enabledWorkflows.length} 个工作流`);

    this.setSharedData('workflowConfigs', this.enabledWorkflows);
    return this.enabledWorkflows;
  }

  /**
   * 步骤2: 执行子工作流
   */
  async stepExecuteSubWorkflows(results) {
    console.log('📋 步骤2: 执行子工作流...');

    const workflowResults = {};

    for (const workflowConfig of this.enabledWorkflows) {
      console.log(`🔄 执行子工作流: ${workflowConfig.name}`);

      try {
        const result = await this.executeAtomicOperation('executeSubWorkflow', {
          workflowName: workflowConfig.name,
          options: {
            ...workflowConfig.options,
            context: this.context
          }
        });

        workflowResults[workflowConfig.name] = {
          success: true,
          result: result.result,
          executionTime: result.executionTime,
          timestamp: new Date().toISOString()
        };

        console.log(`✅ 子工作流执行完成: ${workflowConfig.name}`);

      } catch (error) {
        console.error(`❌ 子工作流执行失败: ${workflowConfig.name}`, error);

        workflowResults[workflowConfig.name] = {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }

    results.workflowResults = workflowResults;
    this.setSharedData('workflowResults', workflowResults);

    return workflowResults;
  }

  /**
   * 步骤3: 聚合结果
   */
  async stepAggregateResults(results) {
    console.log('📋 步骤3: 聚合结果...');

    const aggregatedData = await this.executeAtomicOperation('aggregateResults', {
      workflowResults: results.workflowResults
    });

    results.aggregatedData = aggregatedData.result;
    this.setSharedData('aggregatedData', aggregatedData.result);

    return aggregatedData.result;
  }

  /**
   * 步骤4: 分析数据
   */
  async stepAnalyzeResults(results) {
    console.log('📋 步骤4: 分析数据...');

    const analysis = await this.executeAtomicOperation('analyzeResults', {
      aggregatedData: results.aggregatedData
    });

    results.analysis = analysis.result;
    this.setSharedData('analysis', analysis.result);

    return analysis.result;
  }

  /**
   * 步骤5: 生成报告
   */
  async stepGenerateReport(results) {
    console.log('📋 步骤5: 生成报告...');

    const report = await this.executeAtomicOperation('generateReport', {
      workflowResults: results.workflowResults,
      aggregatedData: results.aggregatedData,
      analysis: results.analysis,
      metadata: results.metadata
    });

    results.report = report.result;
    this.setSharedData('report', report.result);

    return report.result;
  }

  /**
   * 步骤6: 处理和保存数据
   */
  async stepProcessResults(results) {
    console.log('📋 步骤6: 处理和保存数据...');

    // 更新元数据
    results.metadata.totalWorkflows = this.enabledWorkflows.length;
    results.metadata.completedWorkflows = Object.values(results.workflowResults).filter(r => r.success).length;
    results.metadata.failedWorkflows = Object.values(results.workflowResults).filter(r => !r.success).length;
    results.metadata.executionTime = Date.now() - this.state.startTime;
    results.metadata.extractedAt = new Date().toISOString();

    // 保存到共享数据
    this.setSharedData('finalResults', results);

    return results;
  }
}

/**
 * 微博关键词监控工作流
 * 监控特定关键词的微博内容
 */
class WeiboKeywordMonitoringWorkflow extends BaseWorkflow {
  constructor(config = {}) {
    super({
      name: 'weibo-keyword-monitoring',
      version: '1.0.0',
      description: '微博关键词监控工作流',
      timeout: 240000,
      maxRetries: 2,
      category: 'monitoring',
      ...config
    });

    this.keywords = config.keywords || [];
    this.monitoringPeriod = config.monitoringPeriod || 24; // 小时
  }

  async registerAtomicOperations() {
    console.log('📝 注册关键词监控原子操作...');

    this.registerAtomicOperation('searchKeywords', new SearchKeywordsOperation());
    this.registerAtomicOperation('compareWithPrevious', new CompareWithPreviousOperation());
    this.registerAtomicOperation('detectTrends', new DetectTrendsOperation());
    this.registerAtomicOperation('generateAlerts', new GenerateAlertsOperation());

    console.log('✅ 关键词监控原子操作注册完成');
  }

  async executeWorkflow(options = {}) {
    console.log('🔧 开始执行微博关键词监控工作流...');

    const keywords = options.keywords || this.keywords;
    if (!keywords.length) {
      throw new Error('缺少监控关键词');
    }

    const results = {
      keywordResults: {},
      trends: {},
      alerts: [],
      metadata: {
        workflowName: this.config.name,
        version: this.config.version,
        keywords: keywords,
        monitoringPeriod: this.monitoringPeriod,
        extractedAt: new Date().toISOString()
      }
    };

    try {
      // 搜索每个关键词
      for (const keyword of keywords) {
        console.log(`🔍 监控关键词: ${keyword}`);

        try {
          const searchResult = await this.executeAtomicOperation('searchKeywords', {
            keyword: keyword,
            options: {
              maxResults: 50,
              timeRange: this.monitoringPeriod
            }
          });

          results.keywordResults[keyword] = searchResult.result;

        } catch (error) {
          console.error(`❌ 关键词搜索失败: ${keyword}`, error);
          results.keywordResults[keyword] = { error: error.message };
        }
      }

      // 比较历史数据
      const comparison = await this.executeAtomicOperation('compareWithPrevious', {
        keywordResults: results.keywordResults
      });

      // 检测趋势
      const trends = await this.executeAtomicOperation('detectTrends', {
        keywordResults: results.keywordResults,
        comparison: comparison.result
      });

      results.trends = trends.result;

      // 生成告警
      const alerts = await this.executeAtomicOperation('generateAlerts', {
        keywordResults: results.keywordResults,
        trends: trends.result
      });

      results.alerts = alerts.result;

      console.log(`✅ 关键词监控完成，发现 ${results.alerts.length} 个告警`);

      return results;

    } catch (error) {
      console.error('❌ 关键词监控工作流执行失败:', error);
      throw error;
    }
  }
}

/**
 * 微博用户追踪工作流
 * 追踪特定用户的微博动态
 */
class WeiboUserTrackingWorkflow extends BaseWorkflow {
  constructor(config = {}) {
    super({
      name: 'weibo-user-tracking',
      version: '1.0.0',
      description: '微博用户追踪工作流',
      timeout: 180000,
      maxRetries: 2,
      category: 'tracking',
      ...config
    });

    this.targetUsers = config.targetUsers || [];
    this.trackingDepth = config.trackingDepth || 3; // 追踪深度
  }

  async registerAtomicOperations() {
    console.log('📝 注册用户追踪原子操作...');

    this.registerAtomicOperation('trackUsers', new TrackUsersOperation());
    this.registerAtomicOperation('analyzeUserActivity', new AnalyzeUserActivityOperation());
    this.registerAtomicOperation('detectAnomalies', new DetectAnomaliesOperation());
    this.registerAtomicOperation('generateTrackingReport', new GenerateTrackingReportOperation());

    console.log('✅ 用户追踪原子操作注册完成');
  }

  async executeWorkflow(options = {}) {
    console.log('🔧 开始执行微博用户追踪工作流...');

    const targetUsers = options.targetUsers || this.targetUsers;
    if (!targetUsers.length) {
      throw new Error('缺少追踪用户');
    }

    const results = {
      userTrackingData: {},
      activityAnalysis: {},
      anomalies: [],
      trackingReport: {},
      metadata: {
        workflowName: this.config.name,
        version: this.config.version,
        targetUsers: targetUsers,
        trackingDepth: this.trackingDepth,
        extractedAt: new Date().toISOString()
      }
    };

    try {
      // 追踪每个用户
      for (const user of targetUsers) {
        console.log(`👤 追踪用户: ${user}`);

        try {
          const trackingResult = await this.executeAtomicOperation('trackUsers', {
            user: user,
            options: {
              depth: this.trackingDepth
            }
          });

          results.userTrackingData[user] = trackingResult.result;

        } catch (error) {
          console.error(`❌ 用户追踪失败: ${user}`, error);
          results.userTrackingData[user] = { error: error.message };
        }
      }

      // 分析用户活动
      const activityAnalysis = await this.executeAtomicOperation('analyzeUserActivity', {
        userTrackingData: results.userTrackingData
      });

      results.activityAnalysis = activityAnalysis.result;

      // 检测异常
      const anomalies = await this.executeAtomicOperation('detectAnomalies', {
        userTrackingData: results.userTrackingData,
        activityAnalysis: activityAnalysis.result
      });

      results.anomalies = anomalies.result;

      // 生成追踪报告
      const trackingReport = await this.executeAtomicOperation('generateTrackingReport', {
        userTrackingData: results.userTrackingData,
        activityAnalysis: activityAnalysis.result,
        anomalies: anomalies.result
      });

      results.trackingReport = trackingReport.result;

      console.log(`✅ 用户追踪完成，发现 ${results.anomalies.length} 个异常`);

      return results;

    } catch (error) {
      console.error('❌ 用户追踪工作流执行失败:', error);
      throw error;
    }
  }
}

// 复合工作流专用原子操作
class ExecuteSubWorkflowOperation extends BaseAtomicOperation {
  async execute(context, params) {
    const { workflowName, options } = params;

    console.log(`🔧 执行子工作流: ${workflowName}`);

    // 这里需要调用具体的工作流执行逻辑
    // 实际实现中会使用 WorkflowOrchestrator 来执行

    const startTime = Date.now();

    try {
      // 模拟子工作流执行
      await new Promise(resolve => setTimeout(resolve, 1000));

      const mockResult = {
        posts: [`mock-post-${workflowName}-${Date.now()}`],
        metadata: {
          workflowName: workflowName,
          extractedAt: new Date().toISOString()
        }
      };

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        result: mockResult,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        error: error.message,
        executionTime
      };
    }
  }
}

class AggregateResultsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📊 聚合工作流结果...');

    const { workflowResults } = params;
    const aggregatedData = {
      totalPosts: 0,
      totalUsers: 0,
      totalKeywords: 0,
      uniquePosts: new Set(),
      uniqueUsers: new Set(),
      keywords: new Set(),
      timeRange: { start: null, end: null },
      categories: {}
    };

    // 聚合数据
    for (const [workflowName, result] of Object.entries(workflowResults)) {
      if (!result.success) continue;

      const data = result.result;

      // 聚合帖子
      if (data.posts) {
        data.posts.forEach(post => {
          aggregatedData.uniquePosts.add(post.id);
          if (post.author) {
            aggregatedData.uniqueUsers.add(post.author);
          }
        });
      }

      // 聚合关键词
      if (data.keyword) {
        aggregatedData.keywords.add(data.keyword);
      }

      // 更新分类统计
      if (!aggregatedData.categories[workflowName]) {
        aggregatedData.categories[workflowName] = 0;
      }
      aggregatedData.categories[workflowName] += data.posts?.length || 0;
    }

    // 转换为数组
    aggregatedData.totalPosts = aggregatedData.uniquePosts.size;
    aggregatedData.totalUsers = aggregatedData.uniqueUsers.size;
    aggregatedData.totalKeywords = aggregatedData.keywords.size;
    aggregatedData.uniquePosts = Array.from(aggregatedData.uniquePosts);
    aggregatedData.uniqueUsers = Array.from(aggregatedData.uniqueUsers);
    aggregatedData.keywords = Array.from(aggregatedData.keywords);

    console.log(`📊 聚合完成: ${aggregatedData.totalPosts} 帖子, ${aggregatedData.totalUsers} 用户`);

    return {
      success: true,
      result: aggregatedData
    };
  }
}

class AnalyzeResultsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📈 分析聚合结果...');

    const { aggregatedData } = params;
    const analysis = {
      summary: {
        totalPosts: aggregatedData.totalPosts,
        totalUsers: aggregatedData.totalUsers,
        totalKeywords: aggregatedData.totalKeywords,
        averagePostsPerUser: aggregatedData.totalUsers > 0 ?
          (aggregatedData.totalPosts / aggregatedData.totalUsers).toFixed(2) : 0
      },
      topCategories: [],
      trends: {
        postGrowth: 'stable',
        userActivity: 'normal',
        keywordPopularity: 'stable'
      },
      insights: []
    };

    // 分析分类
    const sortedCategories = Object.entries(aggregatedData.categories)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    analysis.topCategories = sortedCategories;

    // 生成洞察
    if (aggregatedData.totalPosts > 100) {
      analysis.insights.push('检测到大量帖子数据，可能存在热门事件');
    }

    if (aggregatedData.totalUsers > 50) {
      analysis.insights.push('涉及用户数量较多，影响力较广');
    }

    if (aggregatedData.totalKeywords > 10) {
      analysis.insights.push('关键词覆盖面广，内容多样性高');
    }

    console.log('📈 分析完成');

    return {
      success: true,
      result: analysis
    };
  }
}

class GenerateReportOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📄 生成综合报告...');

    const { workflowResults, aggregatedData, analysis, metadata } = params;
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalWorkflows: Object.keys(workflowResults).length,
        successfulWorkflows: Object.values(workflowResults).filter(r => r.success).length,
        failedWorkflows: Object.values(workflowResults).filter(r => !r.success).length,
        totalPosts: aggregatedData.totalPosts,
        totalUsers: aggregatedData.totalUsers,
        totalKeywords: aggregatedData.totalKeywords
      },
      workflowDetails: workflowResults,
      dataAnalysis: analysis,
      recommendations: [
        '建议定期执行监控工作流',
        '可配置告警机制实时响应',
        '建议优化数据存储和查询性能'
      ]
    };

    console.log('📄 报告生成完成');

    return {
      success: true,
      result: report
    };
  }
}

// 关键词监控专用原子操作
class SearchKeywordsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    const { keyword, options } = params;

    console.log(`🔍 搜索关键词: ${keyword}`);

    // 模拟搜索结果
    const mockResults = {
      keyword: keyword,
      posts: Array.from({ length: 10 }, (_, i) => ({
        id: `post-${keyword}-${i}`,
        content: `包含关键词"${keyword}"的微博内容 ${i}`,
        author: `用户${i}`,
        time: new Date(Date.now() - i * 3600000).toISOString(),
        relevanceScore: Math.random() * 100
      })),
      searchTime: new Date().toISOString(),
      totalResults: 10
    };

    return {
      success: true,
      result: mockResults
    };
  }
}

class CompareWithPreviousOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📊 比较历史数据...');

    const comparison = {
      newPosts: 0,
      deletedPosts: 0,
      trendingPosts: [],
      changes: []
    };

    return {
      success: true,
      result: comparison
    };
  }
}

class DetectTrendsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📈 检测趋势...');

    const trends = {
      trending: [],
      declining: [],
      stable: []
    };

    return {
      success: true,
      result: trends
    };
  }
}

class GenerateAlertsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🚨 生成告警...');

    const alerts = [];

    // 模拟告警生成
    if (Math.random() > 0.7) {
      alerts.push({
        type: 'spike',
        message: '检测到帖子数量异常增长',
        severity: 'warning',
        timestamp: new Date().toISOString()
      });
    }

    return {
      success: true,
      result: alerts
    };
  }
}

// 用户追踪专用原子操作
class TrackUsersOperation extends BaseAtomicOperation {
  async execute(context, params) {
    const { user, options } = params;

    console.log(`👤 追踪用户: ${user}`);

    const trackingData = {
      user: user,
      profile: {
        username: user,
        posts: Math.floor(Math.random() * 1000),
        followers: Math.floor(Math.random() * 10000),
        following: Math.floor(Math.random() * 1000)
      },
      recentPosts: Array.from({ length: 5 }, (_, i) => ({
        id: `post-${user}-${i}`,
        content: `用户${user}的微博内容 ${i}`,
        time: new Date(Date.now() - i * 86400000).toISOString()
      })),
      lastUpdated: new Date().toISOString()
    };

    return {
      success: true,
      result: trackingData
    };
  }
}

class AnalyzeUserActivityOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📊 分析用户活动...');

    const activityAnalysis = {
      activeUsers: 0,
      inactiveUsers: 0,
      postingFrequency: {},
      peakActivityTimes: []
    };

    return {
      success: true,
      result: activityAnalysis
    };
  }
}

class DetectAnomaliesOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🔍 检测异常行为...');

    const anomalies = [];

    // 模拟异常检测
    if (Math.random() > 0.8) {
      anomalies.push({
        type: 'suspicious_activity',
        user: 'unknown',
        description: '检测到可疑的发帖模式',
        severity: 'medium',
        timestamp: new Date().toISOString()
      });
    }

    return {
      success: true,
      result: anomalies
    };
  }
}

class GenerateTrackingReportOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📄 生成追踪报告...');

    const trackingReport = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalUsers: Object.keys(params.userTrackingData).length,
        totalPosts: 0,
        anomalies: params.anomalies.length
      },
      userSummaries: Object.values(params.userTrackingData).map(data => ({
        username: data.user,
        posts: data.profile.posts,
        followers: data.profile.followers,
        lastActivity: data.recentPosts[0]?.time
      })),
      anomalies: params.anomalies,
      recommendations: [
        '建议持续关注异常用户行为',
        '定期更新用户追踪列表'
      ]
    };

    return {
      success: true,
      result: trackingReport
    };
  }
}

module.exports = {
  WeiboCompleteScanWorkflow,
  WeiboKeywordMonitoringWorkflow,
  WeiboUserTrackingWorkflow,
  WorkflowClasses: {
    WeiboCompleteScanWorkflow,
    WeiboKeywordMonitoringWorkflow,
    WeiboUserTrackingWorkflow
  }
};