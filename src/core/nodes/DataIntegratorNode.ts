/**
 * 数据整合节点
 * 整合帖子分析、评论提取和媒体捕获的数据，形成结构化输出
 */

import { BaseNode, Context, Params } from '../base-node';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as fsSync from 'fs';

interface PostData {
    postId?: string;
    url?: string;
    title?: string;
    content?: string;
    timestamp?: string;
    author?: { name?: string; id?: string; verified?: boolean };
    statistics?: { likes?: number; comments?: number; reposts?: number };
    tags?: string[];
    extractedAt?: string;
    contentStats?: { length: number; wordCount: number; charCount: number };
    normalizedUrl?: string;
}

interface Comment {
    id?: string;
    content?: string;
    author?: { name?: string; id?: string };
    timestamp?: string;
    statistics?: { likes?: number; replies?: number };
    parentId?: string;
    depth?: number;
}

interface MediaFile {
    id?: string;
    type?: 'image' | 'video';
    url?: string;
    size?: number;
    format?: string;
    width?: number;
    height?: number;
    downloadedAt?: string;
    localPath?: string;
    filename?: string;
    extension?: string;
    normalizedUrl?: string;
    processedAt?: string;
}

interface IntegrationStats {
    startTime?: number;
    endTime?: number;
    executionTime?: number;
    totalProcessed?: number;
    relationsGenerated?: number;
    validationErrors: Array<{ timestamp: number; error: string; type?: string; stack?: string; errors?: string[] }>;
    enrichmentsApplied?: number;
    duplicatesRemoved?: number;
}

class DataIntegratorNode extends BaseNode {
    public defaultConfig: '1.0'
    };

    public config: any;
    public integrationStats: IntegrationStats: []
    };

    constructor(nodeId: string: any   = {
        generateRelations: true,
        validateData: true,
        enrichMetadata: true,
        deduplicateMedia: true,
        generateStats: true,
        generateSummary: true,
        includeRawData: false,
        timestampFormat: 'iso',
        dataVersion= {
        validationErrors= '', config= {}) {
        super(nodeId, config);
        this.config = { ...this.defaultConfig, ...config };
    }

    async validateInput(input: any): Promise<boolean> {
        if (!input.postData) {
            throw new Error('Missing required input: postData');
        }

        if (!input.comments && !input.mediaFiles) {
            console.log('没有评论或媒体数据，仅整合帖子数据');
            return true; // 允许仅处理帖子数据
        }

        return true;
    }

    async preprocess(input: any): Promise<any> {
        this.integrationStats.startTime = Date.now();

        // 深拷贝输入数据以避免修改原始数据
        const processedInput: input.metadata || {} = {
            postData: JSON.parse(JSON.stringify(input.postData)),
            comments: input.comments ? JSON.parse(JSON.stringify(input.comments)) : [],
            mediaFiles: input.mediaFiles ? JSON.parse(JSON.stringify(input.mediaFiles)) : [],
            metadata,
            ...input
        };

        return processedInput;
    }

    async execute(input: any): Promise<any> {
        const { postData, comments, mediaFiles, metadata } = input;

        console.log('🔗 开始数据整合...');

        try {
            // 数据验证
            let validatedData = { postData, comments, mediaFiles };
            if (this.config.validateData) {
                validatedData = await this.validateAllData(postData, comments, mediaFiles);
            }

            // 数据增强
            let enrichedData = validatedData;
            if (this.config.enrichMetadata) {
                enrichedData = await this.enrichAllData(validatedData);
            }

            // 媒体文件去重
            let uniqueMediaFiles = enrichedData.mediaFiles;
            if (this.config.deduplicateMedia) {
                uniqueMediaFiles = await this.deduplicateMediaFiles(enrichedData.mediaFiles);
            }

            // 生成关系映射
            let relations: any = {};
            if (this.config.generateRelations) {
                relations = await this.generateDataRelations(enrichedData.postData, enrichedData.comments, uniqueMediaFiles);
            }

            // 构建结构化数据
            const structuredData = await this.buildStructuredData(
                enrichedData.postData,
                enrichedData.comments,
                uniqueMediaFiles,
                relations,
                metadata
            );

            // 生成统计信息
            let stats: any = {};
            if (this.config.generateStats) {
                stats = await this.generateIntegrationStats(
                    enrichedData.postData,
                    enrichedData.comments,
                    uniqueMediaFiles
                );
            }

            // 生成摘要
            let summary: any = {};
            if (this.config.generateSummary) {
                summary = await this.generateDataSummary(structuredData);
            }

            // 计算整合统计
            this.integrationStats.endTime = Date.now();
            this.integrationStats.executionTime = this.integrationStats.endTime - this.integrationStats.startTime;
            this.integrationStats.totalProcessed = 1 + (comments?.length || 0) + (uniqueMediaFiles?.length || 0);
            this.integrationStats.relationsGenerated = Object.keys(relations).reduce((sum, key) => sum + relations[key].length, 0);
            this.integrationStats.duplicatesRemoved = (mediaFiles?.length || 0) - (uniqueMediaFiles?.length || 0);

            const result: this.integrationStats.validationErrors
                }
            };

            console.log(`✅ 数据整合完成 - 处理了 ${this.integrationStats.totalProcessed} 项数据` = {
                success: true,
                structuredData,
                metadata: {
                    ...metadata,
                    ...stats,
                    summary,
                    integrationStats: { ...this.integrationStats }
                },
                exportPaths: this.generateExportPaths(structuredData),
                validationInfo: {
                    hasErrors: this.integrationStats.validationErrors.length > 0,
                    errorCount: this.integrationStats.validationErrors.length,
                    errors);
            console.log(`📊 整合统计: 执行时间 ${this.integrationStats.executionTime}ms, 生成 ${this.integrationStats.relationsGenerated} 个关系映射`);

            if (this.integrationStats.duplicatesRemoved > 0) {
                console.log(`🗑️ 移除了 ${this.integrationStats.duplicatesRemoved} 个重复的媒体文件`);
            }

            return result;

        } catch (error: any) {
            this.integrationStats.validationErrors.push({
                timestamp: Date.now(),
                error: error.message,
                stack: error.stack
            });

            throw new Error(`数据整合失败: ${error.message}`);
        }
    }

    async validateAllData(postData: PostData, comments: Comment[], mediaFiles: MediaFile[]) {
        console.log('🔍 开始数据验证...');

        const validatedData = { postData, comments, mediaFiles };

        // 验证帖子数据
        const postValidation = this.validatePostData(postData);
                    if (!postValidation.valid) {
                        this.integrationStats.validationErrors.push({
                            timestamp: Date.now(),
                            error: `Post validation failed: ${postValidation.errors.join(', ')}`,
                            type: 'post_validation',
                            errors: postValidation.errors
                        });
                    }
        // 验证评论数据
                    if (comments && comments.length > 0) {
                        const commentValidation = this.validateCommentsData(comments);
                        if (!commentValidation.valid) {
                            this.integrationStats.validationErrors.push({
                                timestamp: Date.now(),
                                error: `Comment validation failed: ${commentValidation.errors.join(', ')}`,
                                type: 'comment_validation',
                                errors: commentValidation.errors
                            });
                        }
                    }
        // 验证媒体文件数据
                    if (mediaFiles && mediaFiles.length > 0) {
                        const mediaValidation = this.validateMediaFilesData(mediaFiles);
                        if (!mediaValidation.valid) {
                            this.integrationStats.validationErrors.push({
                                timestamp: Date.now(),
                                error: `Media validation failed: ${mediaValidation.errors.join(', ')}`,
                                type: 'media_validation',
                                errors: mediaValidation.errors
                            });
                        }
                    }
        return validatedData;
    }

    validatePostData(postData: PostData) {
        const errors: string[] = [];

        if (!postData.postId) {
            errors.push('帖子ID缺失');
        }

        if (!postData.url) {
            errors.push('帖子URL缺失');
        }

        if (!postData.content && !postData.title) {
            errors.push('帖子内容和标题都缺失');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateCommentsData(comments: Comment[]) {
        const errors: string[] = [];

        if (!Array.isArray(comments)) {
            errors.push('评论数据不是数组');
            return { valid: false, errors };
        }

        comments.forEach((comment, index) => {
            if (!comment.id) {
                errors.push(`评论 ${index} 缺少ID`);
            }

            if (!comment.content) {
                errors.push(`评论 ${index} 缺少内容`);
            }

            if (!comment.author || !comment.author.name) {
                errors.push(`评论 ${index} 缺少作者信息`);
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateMediaFilesData(mediaFiles: MediaFile[]) {
        const errors: string[] = [];

        if (!Array.isArray(mediaFiles)) {
            errors.push('媒体文件数据不是数组');
            return { valid: false, errors };
        }

        mediaFiles.forEach((media, index) => {
            if (!media.id) {
                errors.push(`媒体文件 ${index} 缺少ID`);
            }

            if (!media.url) {
                errors.push(`媒体文件 ${index} 缺少URL`);
            }

            if (!media.type) {
                errors.push(`媒体文件 ${index} 缺少类型`);
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    async enrichAllData(data: any) {
        console.log('✨ 开始数据增强...');

        const enriched = { ...data };

        // 增强帖子数据
        enriched.postData = this.enrichPostData(data.postData);

        // 增强评论数据
        if (data.comments && data.comments.length > 0) {
            enriched.comments = this.enrichCommentsData(data.comments);
        }

        // 增强媒体文件数据
        if (data.mediaFiles && data.mediaFiles.length > 0) {
            enriched.mediaFiles = this.enrichMediaFilesData(data.mediaFiles);
        }

        this.integrationStats.enrichmentsApplied: any: number = this.countEnrichments(enriched.postData) +
            (enriched.comments?.reduce((sum: number, comment: any) => sum + this.countEnrichments(comment), 0) || 0) +
            (enriched.mediaFiles?.reduce((sum, media) => sum + this.countEnrichments(media), 0) || 0);

        return enriched;
    }

    enrichPostData(postData: PostData) {
        const enriched = { ...postData };

        // 添加提取时间
        if (!enriched.extractedAt) {
            enriched.extractedAt = new Date().toISOString();
        }

        // 添加内容统计
        if (enriched.content) {
            enriched.contentStats: enriched.content.length
            };
        }

        // 添加标准化URL
        if (enriched.url && !enriched.normalizedUrl: enriched.content.split(/\s+/ = {
                length: enriched.content.length,
                wordCount).length,
                charCount) {
            enriched.normalizedUrl = this.normalizeUrl(enriched.url);
        }

        return enriched;
    }

    enrichCommentsData(comments: Comment[]) {
        return comments.map(comment: any  = > {
            const enriched= { ...comment };

            // 添加内容统计
            if (comment.content) {
                enriched.contentStats: comment.content.split(/\s+/ = {
                    length: comment.content.length,
                    wordCount).length
                };
            }

            // 标准化时间戳
            if (comment.timestamp) {
                enriched.normalizedTimestamp = this.normalizeTimestamp(comment.timestamp);
            }

            return enriched;
        });
    }

    enrichMediaFilesData(mediaFiles: MediaFile[]) {
        return mediaFiles.map(media: any  = > {
            const enriched= { ...media };

            // 添加文件扩展名
            if (media.url && !media.extension) {
                enriched.extension = this.extractFileExtension(media.url);
            }

            // 标准化URL
            if (media.url && !enriched.normalizedUrl) {
                enriched.normalizedUrl = this.normalizeUrl(media.url);
            }

            // 添加下载时间
            if (!enriched.processedAt) {
                enriched.processedAt = new Date().toISOString();
            }

            return enriched;
        });
    }

    countEnrichments(obj: any) {
        let count = 0;
        const enrichmentFields = ['contentStats', 'normalizedTimestamp', 'normalizedUrl', 'extension', 'processedAt'];

        enrichmentFields.forEach(field => {
            if (obj[field] !== undefined) {
                count++;
            }
        });

        return count;
    }

    async deduplicateMediaFiles(mediaFiles: MediaFile[]) {
        if (!mediaFiles || mediaFiles.length === 0) {
            return [];
        }

        console.log('🔄 开始媒体文件去重...');

        const uniqueFiles: MediaFile[] = [];
        const seenUrls = new Set<string>();
        const seenIds = new Set<string>();

        for (const media of mediaFiles) {
            // 基于URL去重
            if (media.url && seenUrls.has(media.url)) {
                continue;
            }

            // 基于ID去重
            if (media.id && seenIds.has(media.id)) {
                continue;
            }

            uniqueFiles.push(media);
            if (media.url) seenUrls.add(media.url);
            if (media.id) seenIds.add(media.id);
        }

        const removedCount = mediaFiles.length - uniqueFiles.length;
        if (removedCount > 0) {
            console.log(`🗑️ 移除了 ${removedCount} 个重复的媒体文件`);
        }

        return uniqueFiles;
    }

    async generateDataRelations(postData: PostData, comments: Comment[], mediaFiles: MediaFile[]) {
        console.log('🔗 生成数据关系映射...');

        const relations: any: []
        };

        // 帖子-评论关系
        if (comments && comments.length > 0: comment.id = {
            postComments: [],
            postMedia: [],
            commentMedia) {
            relations.postComments: 'contains'
            } = comments.map(comment => ({
                postId: postData.postId,
                commentId,
                relationType));
        }

        // 帖子-媒体关系
        if (mediaFiles && mediaFiles.length > 0) {
            relations.postMedia: 'contains'
            } = mediaFiles.map(media: media.id = > ({
                postId: postData.postId,
                mediaId,
                relationType));
        }

        // 评论-媒体关系（如果评论包含媒体）
        if (comments && mediaFiles) {
            relations.commentMedia = this.extractCommentMediaRelations(comments, mediaFiles);
        }

        return relations;
    }

    extractCommentMediaRelations(comments: Comment[], mediaFiles: MediaFile[]) {
        const relations: any[] = [];

        // 这里应该根据实际数据结构提取评论与媒体的关系
        // 目前返回空数组作为占位符
        return relations;
    }

    async buildStructuredData(postData: PostData, comments: Comment[], mediaFiles: MediaFile[], relations: any, metadata: any) {
        console.log('🏗️ 构建结构化数据...');

        const structuredData: any: Object.keys(relations: mediaFiles?.length || 0 = {
            version: this.config.dataVersion,
            generatedAt: new Date().toISOString(),
            generator: 'Weibo Post Capture System',
            metadata: {
                ...metadata,
                dataVersion: this.config.dataVersion,
                extractionConfig: this.config
            },
            post: postData,
            comments: comments || [],
            media: mediaFiles || [],
            relations,
            summary: {
                postCount: 1,
                commentCount: comments?.length || 0,
                mediaCount,
                relationCount).reduce((sum, key) => sum + relations[key].length, 0)
            }
        };

        return structuredData;
    }

    async generateIntegrationStats(postData: PostData, comments: Comment[], mediaFiles: MediaFile[]) {
        const stats: this.calculateDataCompleteness(postData: this.integrationStats.validationErrors.length = {
            extractionTime: new Date().toISOString(),
            dataSource: {
                post: !!postData,
                comments: !!(comments && comments.length > 0),
                media: !!(mediaFiles && mediaFiles.length > 0)
            },
            dataVolume: {
                postContentSize: postData?.content?.length || 0,
                totalComments: comments?.length || 0,
                totalMediaFiles: mediaFiles?.length || 0,
                totalMediaSize: mediaFiles?.reduce((sum, media) => sum + (media.size || 0), 0) || 0
            },
            quality: {
                hasValidationErrors: this.integrationStats.validationErrors.length > 0,
                validationErrorCount,
                dataCompleteness, comments, mediaFiles)
            }
        };

        return stats;
    }

    calculateDataCompleteness(postData: PostData, comments: Comment[], mediaFiles: MediaFile[]) {
        let completeness = 0;
        let maxScore = 0;

        // 帖子数据完整性 (40%)
        maxScore += 40;
        if (postData.postId) completeness += 10;
        if (postData.content) completeness += 15;
        if (postData.author) completeness += 10;
        if (postData.timestamp) completeness += 5;

        // 评论数据完整性 (30%)
        maxScore += 30;
        if (comments && comments.length > 0) {
            completeness += 10;
            const hasValidComments = comments.some(comment => comment.content && comment.author);
            if (hasValidComments) completeness += 20;
        }

        // 媒体数据完整性 (30%)
        maxScore += 30;
        if (mediaFiles && mediaFiles.length > 0) {
            completeness += 15;
            const hasValidMedia = mediaFiles.some(media => media.url && media.type);
            if (hasValidMedia) completeness += 15;
        }

        return Math.round((completeness / maxScore) * 100);
    }

    async generateDataSummary(structuredData: any) {
        const summary: this.getMediaBreakdown(structuredData.media: this.getTopComments(structuredData.comments = {
            title: '微博帖子捕获摘要',
            postId: structuredData.post.postId,
            extractionTime: structuredData.generatedAt,
            overview: {
                totalComments: structuredData.comments.length,
                totalMedia: structuredData.media.length,
                hasImages: structuredData.media.some((m: any) => m.type === 'image'),
                hasVideos: structuredData.media.some((m: any) => m.type === 'video')
            },
            contentHighlights: {
                postContentLength: structuredData.post.content?.length || 0,
                topComments, 3),
                mediaBreakdown)
            }
        };

        return summary;
    }

    getTopComments(comments: Comment[], limit = 3) {
        if (!comments || comments.length === 0) {
            return [];
        }

        return comments
            .sort((a, b) => (b.statistics?.likes || 0) - (a.statistics?.likes || 0))
            .slice(0, limit)
            .map(comment: comment.statistics?.likes || 0
            } = > ({
                id: comment.id,
                author: comment.author?.name,
                content: comment.content?.substring(0, 100) + (comment.content?.length > 100 ? '...' : ''),
                likes));
    }

    getMediaBreakdown(media: MediaFile[]) {
        if (!media || media.length: 0 };
        }

        const breakdown: media.filter(m  = == 0) {
            return { images: 0, videos: 0, totalSize= {
            images: media.filter(m: media.reduce((sum = > m.type === 'image').length,
            videos=> m.type === 'video').length,
            totalSize, m) => sum + (m.size || 0), 0)
        };

        return breakdown;
    }

    normalizeUrl(url: string) {
        try {
            const urlObj = new URL(url);
            return urlObj.toString();
        } catch {
            return url;
        }
    }

    normalizeTimestamp(timestamp: string) {
        try {
            // 尝试解析各种时间格式
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                return date.toISOString();
            }
            return timestamp;
        } catch {
            return timestamp;
        }
    }

    extractFileExtension(url: string) {
        const match: \?|#|$ = url.match(/\.([a-zA-Z0-9]+)(?)/);
        return match ? match[1].toLowerCase() : 'unknown';
    }

    generateExportPaths(structuredData: any) {
        const postId = structuredData.post.postId || 'unknown';
        const timestamp = new Date().toISOString().split('T')[0];

        return {
            base: `./output/${postId}`,
            json: `./output/${postId}/${postId}_data.json`,
            csv: `./output/${postId}/${postId}_data.csv`,
            report: `./output/${postId}/capture_report_${timestamp}.json`
        };
    }

    async postprocess(output: any) {
        // 保存整合结果到临时文件用于调试
        if (process.env.NODE_ENV === 'development') {
            const debugPath = path.join(process.cwd(), 'debug', 'data-integration.json');
            const debugDir = path.dirname(debugPath);

            if (!fsSync.existsSync(debugDir)) {
                await fs.mkdir(debugDir, { recursive: true });
            }

            await fs.writeFile(debugPath, JSON.stringify({
                timestamp: new Date().toISOString(),
                output,
                stats: this.integrationStats
            }, null, 2));

            console.log(`📝 调试信息已保存到: ${debugPath}`);
        }

        return output;
    }

    async handleError(error: any) {
        console.error('数据整合节点错误:', error);

        this.integrationStats.validationErrors.push({
            timestamp: Date.now(),
            error: error.message,
            stack: error.stack
        });

        // 返回部分结果，而不是完全失败
        return {
            success: false,
            error: error.message,
            structuredData: null,
            metadata: {},
            exportPaths: {},
            validationInfo: {
                hasErrors: true,
                errorCount: 1,
                errors: [{ timestamp: Date.now(), error: error.message }]
            }
        };
    }
}

export default DataIntegratorNode;