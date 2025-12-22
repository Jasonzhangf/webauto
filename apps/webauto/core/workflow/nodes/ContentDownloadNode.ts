// 内容下载节点
import BaseNode from './BaseNode';

class ContentDownloadNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

    constructor(nodeId: string, config: any) {
        super();
        this.name = 'ContentDownloadNode';
        this.description = '下载微博内容';
    }

    async execute(context: any, params: any): Promise<any> {
        const { config, logger, page, variables } = context;

        try {
            logger.info('📥 开始下载微博内容...');

            // 获取链接数据
            const linksData = variables.get('fileContent');
            let links = [];
            
            // 解析链接数据
            if (typeof linksData === 'string') {
                try {
                    const parsed = JSON.parse(linksData);
                    links = parsed.results?.links || parsed.links || [];
                } catch (e) {
                    // 如果不是JSON格式，假设是纯文本链接列表
                    links = linksData.split('\n').filter(line => line.trim() !== '');
                }
            } else if (Array.isArray(linksData)) {
                links = linksData;
            } else if (linksData && linksData.results) {
                links = linksData.results.links || [];
            }

            logger.info(`📊 共 ${links.length} 个链接待下载`);

            const batchSize = config.batchSize || 5;
            const delayBetweenBatches = config.delayBetweenBatches || 3000;
            const timeout = config.timeout || 30000;
            const retryAttempts = config.retryAttempts || 3;
            const selectors = config.selectors || {};

            const downloadedContent = [];
            let successCount = 0;
            let failedCount = 0;

            // 分批处理链接
            for (let i = 0; i < links.length; i += batchSize) {
                const batch = links.slice(i, i + batchSize);
                logger.info(`📦 处理批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(links.length/batchSize)} (${batch.length} 个链接)`);

                // 并行处理批次中的链接
                const batchPromises = batch.map(async (linkData, index) => {
                    const link = typeof linkData === 'string' ? linkData : linkData.href;
                    const order = typeof linkData === 'string' ? i + index + 1 : linkData.captureOrder || i + index + 1;
                    
                    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
                        try {
                            logger.info(`   📥 下载链接 ${order}: ${link} (尝试 ${attempt}/${retryAttempts})`);
                            
                            // 导航到链接
                            await page.goto(link, { 
                                waitUntil: 'domcontentloaded',
                                timeout: timeout
                            });

                            // 等待内容加载
                            await page.waitForTimeout(2000);

                            // 提取内容
                            const content = await this.extractContent(page, selectors, link, order);
                            
                            if (content) {
                                downloadedContent.push(content);
                                successCount++;
                                logger.info(`   ✅ 成功下载链接 ${order}`);
                                return content;
                            } else {
                                logger.warn(`   ⚠️ 无法提取链接 ${order} 的内容`);
                            }
                        } catch (error) {
                            logger.warn(`   ⚠️ 下载链接 ${order} 失败 (尝试 ${attempt}/${retryAttempts}): ${error.message}`);
                            if (attempt === retryAttempts) {
                                failedCount++;
                            }
                        }
                    }
                    return null;
                });

                // 等待批次完成
                await Promise.allSettled(batchPromises);

                // 批次间延迟
                if (i + batchSize < links.length) {
                    logger.info(`   ⏳ 批次间延迟 ${delayBetweenBatches}ms`);
                    await this.sleep(delayBetweenBatches);
                }
            }

            logger.info(`✅ 下载完成: 成功 ${successCount}, 失败 ${failedCount}`);

            return {
                success: true,
                variables: {
                    downloadedContent: downloadedContent,
                    downloadCount: downloadedContent.length,
                    successCount: successCount,
                    failedCount: failedCount
                },
                results: {
                    content: downloadedContent,
                    summary: {
                        total: links.length,
                        success: successCount,
                        failed: failedCount
                    }
                }
            };

        } catch (error) {
            logger.error(`❌ 内容下载失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async extractContent(page, selectors, url, order) {
        try {
            // 提取微博内容
            const content = await page.evaluate((sel) => {
                // 提取文本内容
                let postContent = '';
                if (sel.postContent) {
                    const contentElement = document.querySelector(sel.postContent);
                    if (contentElement) {
                        postContent = contentElement.innerText || contentElement.textContent || '';
                    }
                }

                // 提取图片链接
                const images = [];
                if (sel.images) {
                    const imageElements = document.querySelectorAll(sel.images);
                    imageElements.forEach(img => {
                        if (img.src) {
                            images.push(img.src);
                        }
                    });
                }

                // 提取视频链接
                const videos = [];
                if (sel.videos) {
                    const videoElements = document.querySelectorAll(sel.videos);
                    videoElements.forEach(video => {
                        if (video.src) {
                            videos.push(video.src);
                        } else if (video.querySelector('source')) {
                            const source = video.querySelector('source');
                            if (source.src) {
                                videos.push(source.src);
                            }
                        }
                    });
                }

                // 提取时间戳
                let timestamp = '';
                if (sel.timestamp) {
                    const timeElement = document.querySelector(sel.timestamp);
                    if (timeElement) {
                        timestamp = timeElement.innerText || timeElement.textContent || '';
                    }
                }

                // 获取页面标题
                const title = document.title || '';

                return {
                    url: window.location.href,
                    title: title,
                    content: postContent.trim(),
                    images: images,
                    videos: videos,
                    timestamp: timestamp.trim(),
                    extractedAt: new Date().toISOString()
                };
            }, selectors);

            // 只有当有内容时才返回
            if (content.content || content.images.length > 0 || content.videos.length > 0) {
                content.order = order;
                return content;
            }

            return null;
        } catch (error) {
            console.warn(`内容提取失败: ${error.message}`);
            return null;
        }
    }

    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                batchSize: {
                    type: 'number',
                    description: '每批处理的链接数',
                    default: 5
                },
                delayBetweenBatches: {
                    type: 'number',
                    description: '批次间延迟（毫秒）',
                    default: 3000
                },
                timeout: {
                    type: 'number',
                    description: '页面加载超时（毫秒）',
                    default: 30000
                },
                retryAttempts: {
                    type: 'number',
                    description: '重试次数',
                    default: 3
                },
                selectors: {
                    type: 'object',
                    description: '内容选择器',
                    properties: {
                        postContent: {
                            type: 'string',
                            description: '微博内容选择器'
                        },
                        images: {
                            type: 'string',
                            description: '图片选择器'
                        },
                        videos: {
                            type: 'string',
                            description: '视频选择器'
                        },
                        timestamp: {
                            type: 'string',
                            description: '时间戳选择器'
                        }
                    }
                }
            },
            required: []
        };
    }

    getInputs() {
        return [
            {
                name: 'page',
                type: 'object',
                description: '页面实例'
            },
            {
                name: 'variables',
                type: 'object',
                description: '变量管理器'
            },
            {
                name: 'fileContent',
                type: 'string|array|object',
                description: '链接文件内容'
            }
        ];
    }

    getOutputs() {
        return [
            {
                name: 'downloadedContent',
                type: 'array',
                description: '下载的内容列表'
            },
            {
                name: 'downloadCount',
                type: 'number',
                description: '下载的链接数'
            },
            {
                name: 'successCount',
                type: 'number',
                description: '成功下载数'
            },
            {
                name: 'failedCount',
                type: 'number',
                description: '下载失败数'
            }
        ];
    }
}

export default ContentDownloadNode;