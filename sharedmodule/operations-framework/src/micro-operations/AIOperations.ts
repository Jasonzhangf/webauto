/**
 * AI Model Operations - Micro-operations for AI model functionality
 */

import BaseOperation from '../core/BaseOperation';
import {
  OperationConfig,
  OperationResult,
  OperationContext
} from '../types';

/**
 * Text Processing Operation - Process text with AI models
 */
export class TextProcessingOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'TextProcessingOperation';
    this.description = 'Process text with AI models for analysis and transformation';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['text-processing', 'ai-analysis'];
    this.supportedContainers = ['text', 'document', 'any'];
    this.capabilities = ['text-analysis', 'content-processing', 'ai-transformation'];

    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.9,
      memoryUsage: 'medium'
    };

    this.requiredParameters = ['text'];
    this.optionalParameters = {
      task: 'summarize', // 'summarize', 'classify', 'extract', 'translate', 'analyze'
      model: 'gpt-3.5-turbo',
      maxLength: 1000,
      temperature: 0.7,
      apiKey: '',
      apiEndpoint: '',
      prompt: '',
      systemPrompt: '',
      maxTokens: 500,
      topP: 1.0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      timeout: 30000,
      retryCount: 3,
      retryDelay: 1000,
      cacheKey: '',
      useCache: true
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting text processing operation', {
      task: finalParams.task,
      textLength: finalParams.text.length,
      params: finalParams
    });

    try {
      // Check cache if enabled
      let cachedResult: any = null;
      if (finalParams.useCache && finalParams.cacheKey) {
        cachedResult = await this.getFromCache(finalParams.cacheKey);
      }

      if (cachedResult) {
        this.log('info', 'Using cached result', { cacheKey: finalParams.cacheKey });
        const executionTime = Date.now() - startTime;
        this.updateStats(true, executionTime);

        return {
          success: true,
          result: cachedResult,
          metadata: {
            cached: true,
            cacheKey: finalParams.cacheKey,
            executionTime
          }
        };
      }

      // Prepare prompt based on task
      const prompt = this.preparePrompt(finalParams);

      // Call AI model
      const aiResult = await this.callAIModel(prompt, finalParams);

      // Process result based on task
      const processedResult = await this.processResult(aiResult, finalParams);

      // Cache result if enabled
      if (finalParams.useCache && finalParams.cacheKey) {
        await this.saveToCache(finalParams.cacheKey, processedResult);
      }

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'Text processing operation completed', {
        task: finalParams.task,
        executionTime
      });

      return {
        success: true,
        result: processedResult,
        metadata: {
          task: finalParams.task,
          model: finalParams.model,
          executionTime,
          cached: false
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'Text processing operation failed', {
        task: finalParams.task,
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          task: finalParams.task,
          executionTime
        }
      };
    }
  }

  private preparePrompt(params: OperationConfig): string {
    const { task, text, prompt, systemPrompt, maxLength } = params;

    // Use custom prompt if provided
    if (prompt) {
      return prompt.replace('${text}', text);
    }

    // Generate task-specific prompt
    switch (task) {
      case 'summarize':
        return `Please summarize the following text in ${maxLength} characters or less:

Text: "${text}"

Summary:`;

      case 'classify':
        return `Please classify the following text into categories (e.g., news, article, blog, comment, etc.):

Text: "${text}"

Classification:`;

      case 'extract':
        return `Please extract key information (entities, keywords, dates, names) from the following text:

Text: "${text}"

Extracted Information:`;

      case 'translate':
        return `Please translate the following text to English:

Text: "${text}"

Translation:`;

      case 'analyze':
        return `Please analyze the following text for sentiment, tone, and key themes:

Text: "${text}"

Analysis:`;

      default:
        return `Process the following text:

Text: "${text}"

Result:`;
    }
  }

  private async callAIModel(prompt: string, params: OperationConfig): Promise<any> {
    // Mock AI model call - in real implementation, this would call actual AI services
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call

    // Mock response based on task
    switch (params.task) {
      case 'summarize':
        return {
          summary: params.text.substring(0, Math.min(params.maxLength, params.text.length)) + '...',
          originalLength: params.text.length,
          summaryLength: Math.min(params.maxLength, params.text.length)
        };

      case 'classify':
        const categories = ['article', 'comment', 'news', 'blog', 'review', 'tutorial'];
        const category = categories[Math.floor(Math.random() * categories.length)];
        return {
          category,
          confidence: 0.8 + Math.random() * 0.2,
          allCategories: categories.map(c => ({
            category: c,
            confidence: c === category ? 0.8 + Math.random() * 0.2 : Math.random() * 0.5
          }))
        };

      case 'extract':
        return {
          entities: this.extractEntities(params.text),
          keywords: this.extractKeywords(params.text),
          dates: this.extractDates(params.text)
        };

      case 'translate':
        return {
          translatedText: `[Translated] ${params.text}`,
          sourceLanguage: 'auto-detected',
          targetLanguage: 'en',
          confidence: 0.9
        };

      case 'analyze':
        return {
          sentiment: this.analyzeSentiment(params.text),
          tone: this.analyzeTone(params.text),
          themes: this.extractThemes(params.text)
        };

      default:
        return {
          processedText: `[Processed] ${params.text}`,
          originalLength: params.text.length
        };
    }
  }

  private async processResult(aiResult: any, params: OperationConfig): Promise<any> {
    // Add processing metadata
    return {
      ...aiResult,
      processingInfo: {
        task: params.task,
        model: params.model,
        processedAt: new Date().toISOString(),
        originalTextLength: params.text.length
      }
    };
  }

  private extractEntities(text: string): any[] {
    // Simple entity extraction - in real implementation, use NLP libraries
    const entities: any[] = [];
    const words = text.split(/\s+/);

    words.forEach(word => {
      if (word.length > 3 && word[0] === word[0].toUpperCase()) {
        entities.push({
          text: word,
          type: 'ENTITY',
          confidence: 0.7
        });
      }
    });

    return entities.slice(0, 10); // Limit results
  }

  private extractKeywords(text: string): any[] {
    // Simple keyword extraction
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const keywords: any[] = [];

    words.forEach(word => {
      if (word.length > 3 && !stopWords.includes(word)) {
        keywords.push({
          text: word,
          frequency: 1
        });
      }
    });

    return keywords.slice(0, 10);
  }

  private extractDates(text: string): any[] {
    // Simple date extraction
    const datePattern = /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/g;
    const matches = text.match(datePattern) || [];

    return matches.map(date => ({
      text: date,
      type: 'DATE',
      confidence: 0.8
    }));
  }

  private analyzeSentiment(text: string): any {
    // Simple sentiment analysis
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'poor', 'worst'];

    const words = text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;

    words.forEach(word => {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
    });

    const sentiment = positiveCount > negativeCount ? 'positive' :
                     negativeCount > positiveCount ? 'negative' : 'neutral';

    return {
      sentiment,
      confidence: Math.min(0.9, Math.max(0.3, Math.abs(positiveCount - negativeCount) / words.length)),
      positiveScore: positiveCount / words.length,
      negativeScore: negativeCount / words.length
    };
  }

  private analyzeTone(text: string): string[] {
    // Simple tone analysis
    const toneKeywords = {
      formal: ['therefore', 'however', 'furthermore', 'consequently'],
      casual: ['hey', 'cool', 'awesome', 'dude'],
      technical: ['algorithm', 'implementation', 'framework', 'architecture'],
      emotional: ['love', 'hate', 'excited', 'disappointed']
    };

    const tones: string[] = [];
    const words = text.toLowerCase().split(/\s+/);

    Object.entries(toneKeywords).forEach(([tone, keywords]) => {
      const matches = keywords.filter(keyword => words.includes(keyword)).length;
      if (matches > 0) {
        tones.push(tone);
      }
    });

    return tones.length > 0 ? tones : ['neutral'];
  }

  private extractThemes(text: string): any[] {
    // Simple theme extraction
    const themes = [
      { name: 'technology', keywords: ['computer', 'software', 'technology', 'digital'] },
      { name: 'business', keywords: ['business', 'company', 'market', 'revenue'] },
      { name: 'education', keywords: ['education', 'learning', 'school', 'university'] },
      { name: 'health', keywords: ['health', 'medical', 'doctor', 'patient'] }
    ];

    const words = text.toLowerCase().split(/\s+/);
    const detectedThemes: any[] = [];

    themes.forEach(theme => {
      const matches = theme.keywords.filter(keyword => words.includes(keyword)).length;
      if (matches > 0) {
        detectedThemes.push({
          theme: theme.name,
          confidence: Math.min(0.9, matches * 0.3),
          keywords: theme.keywords.filter(keyword => words.includes(keyword))
        });
      }
    });

    return detectedThemes;
  }

  private async getFromCache(cacheKey: string): Promise<any> {
    // Mock cache implementation
    return null;
  }

  private async saveToCache(cacheKey: string, result: any): Promise<void> {
    // Mock cache implementation
    this.log('info', 'Result cached', { cacheKey });
  }
}

/**
 * Content Analysis Operation - Analyze content structure and quality
 */
export class ContentAnalysisOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'ContentAnalysisOperation';
    this.description = 'Analyze content structure, quality, and extract insights';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['content-analysis', 'quality-assessment'];
    this.supportedContainers = ['text', 'document', 'web-page', 'any'];
    this.capabilities = ['content-quality', 'structure-analysis', 'insight-extraction'];

    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.9,
      memoryUsage: 'medium'
    };

    this.requiredParameters = ['content'];
    this.optionalParameters = {
      contentType: 'auto', // 'auto', 'text', 'html', 'markdown', 'json'
      analysisType: 'comprehensive', // 'comprehensive', 'structure', 'quality', 'seo', 'readability'
      includeSuggestions: true,
      maxContentLength: 50000,
      language: 'auto',
      targetAudience: 'general',
      industry: 'general',
      customRules: [],
      benchmark: false
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting content analysis operation', {
      contentType: finalParams.contentType,
      analysisType: finalParams.analysisType,
      contentLength: finalParams.content.length
    });

    try {
      // Detect content type if auto
      const contentType = finalParams.contentType === 'auto'
        ? this.detectContentType(finalParams.content)
        : finalParams.contentType;

      // Prepare content for analysis
      const preparedContent = this.prepareContent(finalParams.content, contentType);

      // Perform analysis based on type
      const analysis = await this.performAnalysis(preparedContent, finalParams);

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'Content analysis operation completed', {
        contentType,
        analysisType: finalParams.analysisType,
        executionTime
      });

      return {
        success: true,
        result: {
          analysis,
          metadata: {
            contentType,
            analysisType: finalParams.analysisType,
            contentLength: preparedContent.length,
            executionTime
          }
        },
        metadata: {
          contentType,
          analysisType: finalParams.analysisType,
          executionTime
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'Content analysis operation failed', {
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          executionTime
        }
      };
    }
  }

  private detectContentType(content: string): string {
    if (content.trim().startsWith('<')) {
      return 'html';
    } else if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      return 'json';
    } else if (content.includes('#') || content.includes('**')) {
      return 'markdown';
    } else {
      return 'text';
    }
  }

  private prepareContent(content: string, contentType: string): string {
    // Limit content length
    if (content.length > 50000) {
      content = content.substring(0, 50000) + '... [truncated]';
    }

    // Clean content based on type
    switch (contentType) {
      case 'html':
        return this.stripHtmlTags(content);
      case 'markdown':
        return this.stripMarkdown(content);
      case 'json':
        try {
          const parsed = JSON.parse(content);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return content;
        }
      default:
        return content;
    }
  }

  private stripHtmlTags(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private stripMarkdown(markdown: string): string {
    return markdown
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async performAnalysis(content: string, params: OperationConfig): Promise<any> {
    const analysis: any = {
      timestamp: new Date().toISOString(),
      basicMetrics: this.calculateBasicMetrics(content),
      quality: this.assessQuality(content),
      readability: this.assessReadability(content)
    };

    if (params.analysisType === 'comprehensive' || params.analysisType === 'structure') {
      analysis.structure = this.analyzeStructure(content);
    }

    if (params.analysisType === 'comprehensive' || params.analysisType === 'seo') {
      analysis.seo = this.analyzeSEO(content);
    }

    if (params.includeSuggestions) {
      analysis.suggestions = this.generateSuggestions(analysis, params);
    }

    if (params.benchmark) {
      analysis.benchmark = this.generateBenchmark(analysis);
    }

    return analysis;
  }

  private calculateBasicMetrics(content: string): any {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const characters = content.replace(/\s/g, '').length;
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    return {
      characterCount: characters,
      wordCount: words.length,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      averageWordsPerSentence: words.length / sentences.length,
      averageWordsPerParagraph: words.length / paragraphs.length,
      averageCharactersPerWord: characters / words.length
    };
  }

  private assessQuality(content: string): any {
    const issues: string[] = [];
    const score = 100;

    // Check for various quality issues
    if (content.length < 100) {
      issues.push('Content is very short');
    }

    if (content.split(/\s+/).length < 20) {
      issues.push('Insufficient word count');
    }

    // Check for excessive repetition
    const words = content.toLowerCase().split(/\s+/);
    const wordFreq: Record<string, number> = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    const highFreqWords = Object.entries(wordFreq)
      .filter(([word, freq]) => freq > words.length * 0.1)
      .map(([word]) => word);

    if (highFreqWords.length > 0) {
      issues.push(`High frequency words: ${highFreqWords.join(', ')}`);
    }

    // Check for very long sentences
    const sentences = content.split(/[.!?]+/);
    const longSentences = sentences.filter(s => s.split(/\s+/).length > 30);
    if (longSentences.length > 0) {
      issues.push(`${longSentences.length} very long sentences detected`);
    }

    return {
      score: Math.max(0, score - issues.length * 10),
      issues,
      grade: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor'
    };
  }

  private assessReadability(content: string): any {
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const syllables = words.reduce((sum, word) => sum + this.countSyllables(word), 0);

    // Flesch Reading Ease
    const fleschScore = 206.835 - (1.015 * (words.length / sentences.length)) - (84.6 * (syllables / words.length));

    // Flesch-Kincaid Grade Level
    const fleschGrade = 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;

    return {
      fleschReadingEase: Math.max(0, Math.min(100, fleschScore)),
      fleschGradeLevel: Math.max(0, fleschGrade),
      automatedReadabilityIndex: this.calculateARI(content),
      colemanLiauIndex: this.calculateColemanLiau(content),
      estimatedReadingTime: Math.ceil(words.length / 200), // 200 words per minute
      interpretation: this.interpretReadabilityScore(fleschScore)
    };
  }

  private countSyllables(word: string): number {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;

    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  private calculateARI(content: string): number {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const characters = content.replace(/\s/g, '').length;

    return 4.71 * (characters / words.length) + 0.5 * (words.length / sentences.length) - 21.43;
  }

  private calculateColemanLiau(content: string): number {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const characters = content.replace(/\s/g, '').length;

    const L = (characters / words.length) * 100;
    const S = (sentences.length / words.length) * 100;

    return 0.0588 * L - 0.296 * S - 15.8;
  }

  private interpretReadabilityScore(score: number): string {
    if (score >= 90) return 'Very Easy';
    if (score >= 80) return 'Easy';
    if (score >= 70) return 'Fairly Easy';
    if (score >= 60) return 'Standard';
    if (score >= 50) return 'Fairly Difficult';
    if (score >= 30) return 'Difficult';
    return 'Very Difficult';
  }

  private analyzeStructure(content: string): any {
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.split(/\s+/).filter(w => w.length > 0);

    return {
      paragraphDistribution: paragraphs.map((p, i) => ({
        paragraph: i + 1,
        wordCount: p.split(/\s+/).length,
        sentenceCount: p.split(/[.!?]+/).length
      })),
      sentenceLengthDistribution: this.createDistribution(
        sentences.map(s => s.split(/\s+/).length),
        [5, 10, 15, 20, 25, 30]
      ),
      wordLengthDistribution: this.createDistribution(
        words.map(w => w.length),
        [3, 5, 7, 10, 15]
      ),
      headingStructure: this.analyzeHeadings(content)
    };
  }

  private createDistribution(values: number[], buckets: number[]): any {
    const distribution: any = {};
    const min = Math.min(...values);
    const max = Math.max(...values);

    buckets.forEach(bucket => {
      const count = values.filter(v => v <= bucket).length;
      distribution[`<=${bucket}`] = count;
    });

    return {
      distribution,
      min,
      max,
      average: values.reduce((sum, v) => sum + v, 0) / values.length
    };
  }

  private analyzeHeadings(content: string): any {
    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    const headings: any[] = [];
    let match;

    while ((match = headingPattern.exec(content)) !== null) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        position: match.index
      });
    }

    return {
      count: headings.length,
      levels: this.groupByLevel(headings),
      hierarchy: this.validateHeadingHierarchy(headings)
    };
  }

  private groupByLevel(headings: any[]): any {
    const levels: any = {};
    headings.forEach(h => {
      if (!levels[h.level]) {
        levels[h.level] = [];
      }
      levels[h.level].push(h);
    });
    return levels;
  }

  private validateHeadingHierarchy(headings: any[]): boolean {
    // Simple hierarchy validation
    let currentLevel = 0;
    for (const heading of headings) {
      if (heading.level > currentLevel + 1) {
        return false;
      }
      currentLevel = heading.level;
    }
    return true;
  }

  private analyzeSEO(content: string): any {
    const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const wordFreq: Record<string, number> = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    const topKeywords = Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word, freq]) => ({ word, frequency: freq, density: (freq / words.length) * 100 }));

    return {
      keywordDensity: topKeywords,
      metaDescription: this.generateMetaDescription(content),
      titleSuggestion: this.generateTitleSuggestion(content),
      contentLength: {
        current: words.length,
        optimal: words.length >= 300 && words.length <= 1000 ? 'good' : 'needs improvement'
      },
      readability: this.assessReadability(content).fleschReadingEase
    };
  }

  private generateMetaDescription(content: string): string {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const firstSentences = sentences.slice(0, 2).join('. ');
    return firstSentences.length > 160 ? firstSentences.substring(0, 157) + '...' : firstSentences;
  }

  private generateTitleSuggestion(content: string): string {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 0) {
      const firstSentence = sentences[0];
      return firstSentence.length > 60 ? firstSentence.substring(0, 57) + '...' : firstSentence;
    }
    return 'Content Analysis';
  }

  private generateSuggestions(analysis: any, params: OperationConfig): any[] {
    const suggestions: any[] = [];

    // Quality suggestions
    if (analysis.quality.score < 80) {
      suggestions.push({
        type: 'quality',
        priority: 'high',
        message: 'Consider improving content quality',
        details: analysis.quality.issues
      });
    }

    // Readability suggestions
    if (analysis.readability.fleschReadingEase < 60) {
      suggestions.push({
        type: 'readability',
        priority: 'medium',
        message: 'Content is difficult to read',
        details: 'Consider using shorter sentences and simpler words'
      });
    }

    // SEO suggestions
    if (analysis.seo && analysis.seo.contentLength.optimal !== 'good') {
      suggestions.push({
        type: 'seo',
        priority: 'medium',
        message: 'Content length could be improved',
        details: 'Aim for 300-1000 words for optimal SEO'
      });
    }

    return suggestions;
  }

  private generateBenchmark(analysis: any): any {
    return {
      overallScore: (analysis.quality.score + analysis.readability.fleschReadingEase) / 2,
      percentiles: {
        quality: this.calculatePercentile(analysis.quality.score, [50, 70, 85, 95]),
        readability: this.calculatePercentile(analysis.readability.fleschReadingEase, [30, 50, 70, 90])
      },
      comparison: 'Good content typically scores above 70 in both quality and readability'
    };
  }

  private calculatePercentile(score: number, thresholds: number[]): string {
    for (let i = 0; i < thresholds.length; i++) {
      if (score <= thresholds[i]) {
        return `${i * 25}th percentile`;
      }
    }
    return '90th+ percentile';
  }
}