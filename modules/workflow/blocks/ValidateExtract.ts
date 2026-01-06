/**
 * Workflow Block: ValidateExtract
 *
 * 校验提取数据的有效性
 */

export interface ValidateExtractInput {
  fields: Record<string, any>;
  requiredFields?: string[];
}

export interface ValidateExtractOutput {
  isValid: boolean;
  missingFields: string[];
  validatedFields: Record<string, any>;
  error?: string;
}

/**
 * 校验提取数据
 *
 * @param input - 输入参数
 * @returns ValidateExtractOutput
 */
export async function execute(input: ValidateExtractInput): Promise<ValidateExtractOutput> {
  const { fields, requiredFields = ['author', 'content'] } = input;

  if (!fields || typeof fields !== 'object') {
    return {
      isValid: false,
      missingFields: requiredFields,
      validatedFields: {},
      error: '缺少 fields 数据'
    };
  }

  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (!fields[field] || (typeof fields[field] === 'string' && fields[field].trim() === '')) {
      missingFields.push(field);
    }
  }

  const isValid = missingFields.length === 0;

  return {
    isValid,
    missingFields,
    validatedFields: isValid ? fields : {}
  };
}
