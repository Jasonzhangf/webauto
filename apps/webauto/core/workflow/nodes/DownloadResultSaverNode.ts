// 下载结果保存节点
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import BaseNode from './BaseNode';

class DownloadResultSaverNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

    constructor(nodeId: string, config: any) {
        super();
        this.name = 'DownloadResultSaverNode';
        this.description = '保存下载结果到文件';
    }

    async execute(context: any, params: any): Promise<any> {
        const { config, logger, variables, results } = context;

        try {
            logger.info('💾 保存下载结果...');

            // 构建输出目录
            let outputDir = config.outputDir || variables.get('downloadDir') || '~/.webauto/weibo/downloads';
            if (outputDir.startsWith('~')) {
                outputDir = join(homedir(), outputDir.slice(1));
            }

            // 创建目录
            if (!existsSync(outputDir)) {
                mkdirSync(outputDir, { recursive: true });
            }

            // 生成文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            let filename = config.filenameTemplate || 'weibo-content-{timestamp}.json';

            // 替换模板变量
            filename = filename.replace('{timestamp}', timestamp);

            const filepath = join(outputDir, filename);

            // 构建输出数据
            const output = {
                timestamp,
                workflowType: 'download',
                success: true,
                executionTime: this.calculateExecutionTime(variables),
                metadata: config.includeMetadata ? this.buildMetadata(variables) : undefined,
                results: results.content || [],
                summary: results.summary || {},
                variables: config.includeMetadata ? variables.getAll() : undefined
            };

            // 写入文件
            writeFileSync(filepath, JSON.stringify(output, null, 2));

            logger.info(`✅ 下载结果已保存到: ${filepath}`);

            return {
                success: true,
                variables: {
                    downloadResultSaved: true,
                    downloadResultFilePath: filepath,
                    downloadResultFilename: filename
                }
            };

        } catch (error) {
            logger.error(`❌ 下载结果保存失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    calculateExecutionTime(variables) {
        const startTime = variables.get('startTime');
        const endTime = variables.get('endTime');

        if (startTime && endTime) {
            return new Date(endTime) - new Date(startTime);
        }
        return 0;
    }

    buildMetadata(variables) {
        const metadata = {
            workflowType: 'download',
            capturedAt: new Date().toISOString(),
            downloadCount: 0,
            successCount: 0,
            failedCount: 0
        };

        if (variables.has('downloadCount')) {
            metadata.downloadCount = variables.get('downloadCount');
        }

        if (variables.has('successCount')) {
            metadata.successCount = variables.get('successCount');
        }

        if (variables.has('failedCount')) {
            metadata.failedCount = variables.get('failedCount');
        }

        return metadata;
    }

    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                outputDir: {
                    type: 'string',
                    description: '输出目录',
                    default: '~/.webauto/weibo/downloads'
                },
                filenameTemplate: {
                    type: 'string',
                    description: '文件名模板',
                    default: 'weibo-content-{timestamp}.json'
                },
                includeMetadata: {
                    type: 'boolean',
                    description: '是否包含元数据',
                    default: true
                }
            },
            required: []
        };
    }

    getInputs() {
        return [
            {
                name: 'variables',
                type: 'object',
                description: '变量管理器'
            },
            {
                name: 'results',
                type: 'object',
                description: '工作流结果'
            }
        ];
    }

    getOutputs() {
        return [
            {
                name: 'downloadResultSaved',
                type: 'boolean',
                description: '结果保存状态'
            },
            {
                name: 'downloadResultFilePath',
                type: 'string',
                description: '结果文件路径'
            }
        ];
    }
}

export default DownloadResultSaverNode;