// 结果保存节点
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import BaseNode from './BaseNode';

class ResultSaverNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

    constructor(nodeId: string, config: any) {
        super();
        this.name = 'ResultSaverNode';
        this.description = '保存工作流结果到文件';
    }

    async execute(context: any, params: any): Promise<any> {
        const { config, logger, variables, results } = context;

        try {
            logger.info('💾 保存结果...');

            // 构建输出目录
            let outputDir = config.outputDir || '~/.webauto/weibo';
            if (outputDir.startsWith('~')) {
                outputDir = join(homedir(), outputDir.slice(1));
            }

            // 创建目录
            if (!existsSync(outputDir)) {
                mkdirSync(outputDir, { recursive: true });
            }

            // 生成文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            let filename = config.filenameTemplate || 'workflow-result-{timestamp}.json';

            // 替换模板变量
            filename = filename.replace('{timestamp}', timestamp);
            filename = filename.replace('{searchTerm}', variables.get('searchTerm') || 'unknown');
            filename = filename.replace('{profileId}', variables.get('profileId') || 'unknown');

            const filepath = join(outputDir, filename);

            // 构建输出数据
            const output = {
                timestamp,
                workflowType: this.getWorkflowType(variables),
                success: true,
                executionTime: this.calculateExecutionTime(variables),
                metadata: config.includeMetadata ? this.buildMetadata(variables) : undefined,
                results: results,
                variables: config.includeMetadata ? variables.getAll() : undefined
            };

            // 写入文件
            writeFileSync(filepath, JSON.stringify(output, null, 2));

            logger.info(`✅ 结果已保存到: ${filepath}`);
            context.engine?.recordBehavior?.('result_save', { path: filepath });

            return {
                success: true,
                variables: {
                    resultSaved: true,
                    resultFilePath: filepath,
                    resultFilename: filename
                }
            };

        } catch (error) {
            logger.error(`❌ 结果保存失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getWorkflowType(variables) {
        if (variables.has('searchTerm')) {
            return 'search';
        } else if (variables.has('profileId')) {
            return 'profile';
        } else {
            return 'homepage';
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
            workflowType: this.getWorkflowType(variables),
            capturedAt: new Date().toISOString(),
            linkCount: 0,
            pageCount: 0,
            scrollCount: 0
        };

        if (variables.has('capturedLinks')) {
            metadata.linkCount = variables.get('capturedLinks').length;
        }

        if (variables.has('pageCount')) {
            metadata.pageCount = variables.get('pageCount');
        }

        if (variables.has('scrollCount')) {
            metadata.scrollCount = variables.get('scrollCount');
        }

        if (variables.has('searchTerm')) {
            metadata.searchTerm = variables.get('searchTerm');
        }

        if (variables.has('profileId')) {
            metadata.profileId = variables.get('profileId');
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
                    default: '~/.webauto/weibo'
                },
                filenameTemplate: {
                    type: 'string',
                    description: '文件名模板',
                    default: 'workflow-result-{timestamp}.json'
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
                name: 'resultSaved',
                type: 'boolean',
                description: '结果保存状态'
            },
            {
                name: 'resultFilePath',
                type: 'string',
                description: '结果文件路径'
            }
        ];
    }
}

export default ResultSaverNode;
