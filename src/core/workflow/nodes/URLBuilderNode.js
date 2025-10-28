// URL构建节点
import BaseNode from './BaseNode.js';

class URLBuilderNode extends BaseNode {
    constructor() {
        super();
        this.name = 'URLBuilderNode';
        this.description = '构建目标URL';
    }

    async execute(context) {
        const { config, logger, variables } = context;

        try {
            logger.info('🔗 构建目标URL...');

            let url = config.baseUrl;

            // 获取参数
            let parameterValue = null;

            if (config.appendParameter) {
                // 根据工作流类型获取不同的参数
                if (variables.has('searchTerm')) {
                    parameterValue = variables.get('searchTerm');
                } else if (variables.has('profileId')) {
                    parameterValue = variables.get('profileId');
                }
            }

            // 处理参数
            if (parameterValue) {
                if (config.encoding === 'encodeURIComponent') {
                    parameterValue = encodeURIComponent(parameterValue);
                }
                url += parameterValue;
            }

            logger.info(`✅ URL构建完成: ${url}`);

            return {
                success: true,
                variables: {
                    targetUrl: url,
                    urlBuilt: true,
                    baseUrl: config.baseUrl,
                    parameter: parameterValue
                }
            };

        } catch (error) {
            logger.error(`❌ URL构建失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                baseUrl: {
                    type: 'string',
                    description: '基础URL'
                },
                appendParameter: {
                    type: 'boolean',
                    description: '是否追加参数',
                    default: false
                },
                encoding: {
                    type: 'string',
                    enum: ['none', 'encodeURIComponent'],
                    description: '参数编码方式',
                    default: 'none'
                }
            },
            required: ['baseUrl']
        };
    }

    getInputs() {
        return [
            {
                name: 'variables',
                type: 'object',
                description: '变量管理器'
            }
        ];
    }

    getOutputs() {
        return [
            {
                name: 'targetUrl',
                type: 'string',
                description: '构建的目标URL'
            },
            {
                name: 'urlBuilt',
                type: 'boolean',
                description: 'URL构建状态'
            }
        ];
    }
}

export default URLBuilderNode;