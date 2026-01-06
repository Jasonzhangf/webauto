/**
 * Workflow Block: LoadContainerDefinition
 *
 * 从容器定义文件加载容器配置
 */

import fs from 'fs';
import path from 'path';

export interface LoadContainerDefinitionInput {
  siteKey: string;
  containerId: string;
  containerLibraryRoot: string;
}

export interface LoadContainerDefinitionOutput {
  definition: any;
  metrics: {
    selectors: number;
    operations: number;
  };
  error?: string;
}

/**
 * 加载容器定义
 *
 * @param input - 输入参数
 * @returns Promise<LoadContainerDefinitionOutput>
 */
export async function execute(input: LoadContainerDefinitionInput): Promise<LoadContainerDefinitionOutput> {
  const { siteKey, containerId, containerLibraryRoot } = input;

  if (!containerLibraryRoot) {
    return {
      definition: null,
      metrics: { selectors: 0, operations: 0 },
      error: '缺少容器库根目录'
    };
  }

  const containerPath = path.join(
    containerLibraryRoot,
    siteKey,
    ...containerId.split('.').filter(Boolean),
    'container.json'
  );

  if (!fs.existsSync(containerPath)) {
    return {
      definition: null,
      metrics: { selectors: 0, operations: 0 },
      error: `容器定义不存在: ${containerPath}`
    };
  }

  try {
    const content = fs.readFileSync(containerPath, 'utf-8');
    const containerDef = JSON.parse(content);

    return {
      definition: containerDef,
      metrics: {
        selectors: Array.isArray(containerDef.selectors) ? containerDef.selectors.length : 0,
        operations: Array.isArray(containerDef.operations) ? containerDef.operations.length : 0
      }
    };
  } catch (error: any) {
    return {
      definition: null,
      metrics: { selectors: 0, operations: 0 },
      error: `加载容器定义失败: ${error.message}`
    };
  }
}
