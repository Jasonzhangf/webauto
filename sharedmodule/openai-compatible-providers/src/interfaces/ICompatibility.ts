/**
 * Compatibility Module Interface
 * 兼容性模块接口
 */

export interface ICompatibility {
  /**
   * Map OpenAI request to provider-specific format
   * 将OpenAI请求映射为Provider特定格式
   */
  mapRequest(request: any): any;

  /**
   * Map provider response to OpenAI format
   * 将Provider响应映射为OpenAI格式
   */
  mapResponse(response: any): any;

  /**
   * Get compatibility score (0-1)
   * 获取兼容性评分 (0-1)
   */
  getCompatibilityScore(): number;
}

export default ICompatibility;