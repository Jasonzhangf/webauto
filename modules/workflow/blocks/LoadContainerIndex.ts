/**
 * Workflow Block: LoadContainerIndex
 *
 * 从容器索引文件加载站点配置
 */

import fs from 'fs';
import path from 'path';

export interface LoadContainerIndexInput {
  containerIndexPath: string;
}

export interface LoadContainerIndexOutput {
  index: Record<string, {
    website: string;
    path: string;
    containers: Record<string, any>;
  }>;
  metrics: {
    sites: number;
    totalContainers: number;
  };
  error?: string;
}

/**
 * 加载容器索引
 *
 * @param context - 执行上下文
 * @returns Promise<LoadContainerIndexOutput>
 */
export async function execute(input: LoadContainerIndexInput): Promise<LoadContainerIndexOutput> {
  const { containerIndexPath } = input;

  if (!fs.existsSync(containerIndexPath)) {
    return {
      index: {},
      metrics: { sites: 0, totalContainers: 0 },
      error: '容器索引文件不存在'
    };
  }

  try {
    const content = fs.readFileSync(containerIndexPath, 'utf-8');
    const index = JSON.parse(content);

    const sites = Object.keys(index);
    const totalContainers = sites.reduce((sum, siteKey) => {
      const site = index[siteKey];
      return sum + (site?.containers?.length || 0);
    }, 0);

    return {
      index,
      metrics: { sites: sites.length, totalContainers }
    };
  } catch (error: any) {
    return {
      index: {},
      metrics: { sites: 0, totalContainers: 0 },
      error: `加载索引失败: ${error.message}`
    };
  }
}
