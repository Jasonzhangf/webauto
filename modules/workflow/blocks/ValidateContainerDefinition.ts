/**
 * Workflow Block: ValidateContainerDefinition
 *
 * 验证容器定义的格式完整性
 */

export interface ValidateContainerDefinitionInput {
  definition: any;
}

export interface ValidateContainerDefinitionOutput {
  definition: any;
  validation: {
    isValid: boolean;
    errors?: string[];
  };
  error?: string;
}

/**
 * 验证容器定义
 *
 * @param input - 输入参数
 * @returns ValidateContainerDefinitionOutput
 */
export async function execute(input: ValidateContainerDefinitionInput): Promise<ValidateContainerDefinitionOutput> {
  const { definition } = input;

  if (!definition) {
    return {
      definition: null,
      validation: {
        isValid: false,
        errors: ['缺少容器定义']
      },
      error: '缺少容器定义'
    };
  }

  const errors: string[] = [];

  if (!definition.id) {
    errors.push('缺少 id 字段');
  }
  if (!definition.name) {
    errors.push('缺少 name 字段');
  }
  if (!definition.type) {
    errors.push('缺少 type 字段');
  }

  if (definition.selectors) {
    if (!Array.isArray(definition.selectors)) {
      errors.push('selectors 不是数组');
    } else {
      definition.selectors.forEach((sel: any, idx: number) => {
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

  if (definition.operations && !Array.isArray(definition.operations)) {
    errors.push('operations 不是数组');
  }

  const isValid = errors.length === 0;

  return {
    definition: isValid ? definition : null,
    validation: {
      isValid,
      errors: errors.length > 0 ? errors : undefined
    }
  };
}
