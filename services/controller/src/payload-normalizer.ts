/**
 * Payload 统一解析层
 *
 * 职责：
 * - 将各种变体字段（profile/profileId/profile_id, sessionId/session_id）统一为标准格式
 * - 验证必需字段并提供清晰错误信息
 * - 支持从 payload 内部提取字段（如 config, options）
 *
 * 设计原则：
 * - 优先使用标准字段名（profile）
 * - 兼容历史变体（profileId, profile_id, sessionId, session_id）
 * - config/options 内的字段提升到顶层（便于访问）
 * - 提供清晰的错误信息
 */

  export interface NormalizedPayload {
    /** 统一后的 profile 字段（从 profile/profileId/sessionId 提取） */
    profile: string;
    /** URL（可选） */
    url?: string;
    /** 容器 ID（可选） */
    containerId?: string;
    /** 操作 ID（可选） */
    operationId?: string;
    /** 配置对象（原样保留） */
    config?: Record<string, any>;
    /** 选项对象（原样保留） */
    options?: Record<string, any>;
    /** 脚本（用于 browser:execute） */
    script?: string;
    /** 选择器（用于高亮等） */
    selector?: string;
    /** 路径（用于 inspect-branch） */
    path?: string;
    /** 样式（用于高亮） */
    style?: string;
    /** 持续时间（用于高亮） */
    duration?: number;
    /** 超时时间 */
    timeout?: number;
    /** 最大深度 */
    maxDepth?: number;
    /** 最大子节点数 */
    maxChildren?: number;
    /** 根选择器 */
    rootSelector?: string;
    /** 通道 */
    channel?: string;
    /** 是否粘性 */
    sticky?: boolean;
    /** 最大匹配数 */
    maxMatches?: number;
    /** 其他字段 */
    [key: string]: any;
  }

  export interface NormalizeOptions {
    /** 必需字段列表 */
    required?: string[];
    /** 是否允许 payload 顶层字段（默认 true，兼容现有代码） */
    allowTopLevel?: boolean;
    /** 是否严格模式（不认识的字段报错，默认 false） */
    strict?: boolean;
    /** 默认 profile（如果 payload 中没有） */
    defaultProfile?: string;
  }

  /**
   * 统一 payload 解析
   *
   * @example
   * const normalized = normalizePayload(payload, {
   *   required: ['profile'],
   *   allowTopLevel: true
   * });
   */
  export function normalizePayload(
    payload: Record<string, any> = {},
    options: NormalizeOptions = {}
  ): NormalizedPayload {
    const {
      required = [],
      allowTopLevel = true,
      strict = false,
      defaultProfile
    } = options;

    const normalized: Record<string, any> = {};
    const errors: string[] = [];

    // 1. 处理 profile 字段变体（优先级：profile > profileId > profile_id > sessionId）
    const profile =
      payload.profile ||
      payload.profileId ||
      payload.profile_id ||
      payload.sessionId ||
      payload.session_id ||
      defaultProfile;
    
    if (profile) {
      normalized.profile = profile;
    }

    // 2. 处理其他常见字段（直接从 payload 顶层提取）
    const commonFields = [
      'url',
      'containerId',
      'operationId',
      'script',
      'selector',
      'path',
      'style',
      'duration',
      'timeout',
      'maxDepth',
      'maxChildren',
      'rootSelector',
      'channel',
      'sticky',
      'maxMatches'
    ];

    for (const field of commonFields) {
      if (field in payload && payload[field] !== undefined) {
        normalized[field] = payload[field];
      }
    }

    // 3. 提取内部字段（config/options）并提升到顶层
    // 优先使用 config，其次 options
    const internalConfig = payload.config || payload.options;
    if (internalConfig && typeof internalConfig === 'object') {
      // 将内部字段提升到顶层（便于访问）
      Object.assign(normalized, internalConfig);
      // 同时保留原始引用（便于调试）
      normalized.config = internalConfig;
    }

    // 4. 处理其他顶层字段（根据 allowTopLevel 决定）
    if (allowTopLevel) {
      const reservedFields = new Set([
        'profile',
        'profileId',
        'profile_id',
        'sessionId',
        'session_id',
        'config',
        'options'
      ]);

      for (const [key, value] of Object.entries(payload)) {
        if (!reservedFields.has(key) && !(key in normalized)) {
          if (strict) {
            errors.push(`Unexpected field in payload: ${key}`);
          } else {
            normalized[key] = value;
          }
        }
      }
    }

    // 5. 验证必需字段
    for (const field of required) {
      if (!(field in normalized) || normalized[field] === undefined || normalized[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Payload validation failed:\n  - ${errors.join('\n  - ')}`);
    }

    return normalized as NormalizedPayload;
  }

  /**
   * 创建带验证的 payload 解析器（闭包形式，便于复用配置）
   */
  export function createPayloadParser(options: NormalizeOptions) {
    return (payload: Record<string, any>): NormalizedPayload =>
      normalizePayload(payload, options);
  }

  /**
   * 验证 payload 是否包含指定字段
   */
  export function hasRequiredFields(
    payload: Record<string, any>,
    fields: string[]
  ): boolean {
    return fields.every((field) => {
      const value = payload[field];
      return value !== undefined && value !== null && value !== '';
    });
  }

  /**
   * 提取 profile（兼容多种写法）
   */
  export function extractProfile(
    payload: Record<string, any>
  ): string | undefined {
    return (
      payload.profile ||
      payload.profileId ||
      payload.profile_id ||
      payload.sessionId ||
      payload.session_id
    );
  }

  export default normalizePayload;
