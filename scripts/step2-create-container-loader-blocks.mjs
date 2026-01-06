/**
 * Step 2: 创建容器加载验证脚本（Workflow Blocks）
 * 核心目标：将容器加载逻辑固化为可组合的 Workflow 基本程序块
 */

import fs from 'fs/promises';
import path from 'path';

// ========================================
// Block 1: LoadContainerIndex
// ========================================

/**
 * 从容器索引文件加载站点配置
 *
 * 输入：无
 * 输出：
 *   - 站点配置对象（包含 website, path 等）
 */
async function executeLoadContainerIndex(context) {
  const { containerIndexPath } = context;

  if (!fs.existsSync(containerIndexPath)) {
    return {
      error: '容器索引文件不存在',
      output: null
    };
  }

  try {
    const content = await fs.readFile(containerIndexPath, 'utf-8');
    const index = JSON.parse(content);

    return {
      output: index,
      metrics: {
        sites: Object.keys(index).length,
        totalContainers: Object.values(index).reduce((sum, site) => sum + site.containers.length, 0)
      }
    };
  } catch (error) {
    return {
      error: `加载索引失败: ${error.message}`,
      output: null
    };
  }
}

// ========================================
// Block 2: LoadContainerDefinition
// ========================================

/**
 * 从容器定义文件加载容器配置
 *
 * 输入：
 *   - siteKey: 站点标识
 *   - containerId: 容器 ID
 *
 * 输出：
 *   - 容器定义对象
 */
async function executeLoadContainerDefinition(context) {
  const { siteKey, containerId, containerLibraryRoot } = context;

  if (!containerLibraryRoot) {
    return {
      error: '缺少容器库根目录',
      output: null
    };
  }

  const containerPath = path.join(
    containerLibraryRoot,
    siteKey || 'weibo',
    ...containerId.split('.').filter(Boolean),
    'container.json'
  );

  if (!fs.existsSync(containerPath)) {
    return {
      output: null,
      note: `容器定义不存在: ${containerPath}`
    };
  }

  try {
    const content = await fs.readFile(containerPath, 'utf-8');
    const containerDef = JSON.parse(content);

    return {
      output: containerDef,
      metrics: {
        selectors: Array.isArray(containerDef.selectors) ? containerDef.selectors.length : 0,
        hasOperations: Array.isArray(containerDef.operations) ? containerDef.operations.length : 0
      }
    };
  } catch (error) {
    return {
      error: `加载容器定义失败: ${error.message}`,
      output: null
    };
  }
}

// ========================================
// Block 3: ValidateContainerDefinition
// ========================================

/**
 * 验证容器定义的格式完整性
 *
 * 输入：containerDefinition（容器定义对象）
 *
 * 输出：
 *   - validation: { isValid, errors }
 *   - 容器定义对象（如果有效）
 */
function executeValidateContainerDefinition(context) {
  const { containerDefinition } = context;

  if (!containerDefinition) {
    return {
      error: '缺少容器定义',
      output: null
    };
  }

  const errors = [];

  // 1. 检查必填字段
  if (!containerDefinition.id) {
    errors.push('缺少 id 字段');
  }
  if (!containerDefinition.name) {
    errors.push('缺少 name 字段');
  }
  if (!containerDefinition.type) {
    errors.push('缺少 type 字段');
  }

  // 2. 验证 selectors
  if (containerDefinition.selectors) {
    if (!Array.isArray(containerDefinition.selectors)) {
      errors.push('selectors 不是数组');
    } else {
      containerDefinition.selectors.forEach((sel, idx) => {
        if (!sel.css) {
          errors.push(`selectors[${idx}] 缺少 css 字段`);
        }
        if (!sel.variant) {
          errors.push(`selectors[${idx}] 缺少 variant 字段`);
        }
        if (!sel.score) {
          errors.push(`selectors[${idx}] 缺少 score 字段`);
        }
      });
    }
  } else {
    errors.push('缺少 selectors 字段');
  }

  // 3. 验证 operations（可选）
  if (containerDefinition.operations && !Array.isArray(containerDefinition.operations)) {
    errors.push('operations 不是数组');
  }

  const isValid = errors.length === 0;

  return {
    output: isValid ? containerDefinition : null,
    validation: {
      isValid,
      errors: errors.length > 0 ? errors : undefined
    }
  };
}

// ========================================
// 主执行函数
// ========================================

/**
 * 根据命令执行相应的 block
 */
export async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'verify';

  console.log('🔄 Step 2: 容器加载验证脚本');
  console.log('命令:', command);
  console.log('参数:', args.slice(1));

  const context = {
    containerIndexPath: path.join(process.cwd(), 'container-library.index.json'),
    containerLibraryRoot: path.join(process.cwd(), 'container-library', 'weibo')
  };

  let result;

  switch (command) {
    case 'index':
      result = await executeLoadContainerIndex(context);
      break;

    case 'load':
      result = await executeLoadContainerDefinition(context);
      break;

    case 'validate':
      result = await executeValidateContainerDefinition({
        containerDefinition: result?.output || context
      });
      break;

    default:
      return {
        error: `未知命令: ${command}`,
        usage: '可用命令: index, load, validate'
      };
  }

  // 输出结果
  console.log('');
  console.log(JSON.stringify({
    step: 2,
    command,
    result: result
  }, null, 2));

  if (result.error) {
    console.error('❌', result.error);
    process.exit(1);
  } else {
    console.log('✅ 执行成功');
  }
}
