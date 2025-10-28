// 文件读取节点
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import BaseNode from './BaseNode.js';

class FileReaderNode extends BaseNode {
    constructor() {
        super();
        this.name = 'FileReaderNode';
        this.description = '读取文件内容';
    }

    async execute(context) {
        const { config, logger, variables } = context;

        try {
            logger.info('📄 读取文件内容...');

            // 获取文件路径
            let filepath = config.filePath || variables.get('inputFile');
            
            if (!filepath) {
                throw new Error('未指定文件路径');
            }

            // 处理用户目录
            if (filepath.startsWith('~')) {
                filepath = join(homedir(), filepath.slice(1));
            }

            // 读取文件
            const encoding = config.encoding || 'utf8';
            const fileContent = readFileSync(filepath, { encoding });

            logger.info(`✅ 文件读取成功: ${filepath}`);

            return {
                success: true,
                variables: {
                    fileContent: fileContent,
                    filePath: filepath
                },
                results: {
                    content: fileContent,
                    filePath: filepath
                }
            };

        } catch (error) {
            logger.error(`❌ 文件读取失败: ${error.message}`);
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
                filePath: {
                    type: 'string',
                    description: '文件路径'
                },
                encoding: {
                    type: 'string',
                    description: '文件编码',
                    default: 'utf8'
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
            }
        ];
    }

    getOutputs() {
        return [
            {
                name: 'fileContent',
                type: 'string',
                description: '文件内容'
            },
            {
                name: 'filePath',
                type: 'string',
                description: '文件路径'
            }
        ];
    }
}

export default FileReaderNode;