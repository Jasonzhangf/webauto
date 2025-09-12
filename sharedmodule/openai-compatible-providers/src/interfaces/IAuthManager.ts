/**
 * Authentication Manager Interface
 * 认证管理器接口
 */

export interface IAuthManager {
  /**
   * Authenticate with the provider
   * 认证Provider
   */
  authenticate(): Promise<boolean>;

  /**
   * Check if authenticated
   * 检查是否已认证
   */
  isAuthenticated(): boolean;

  /**
   * Get authentication token
   * 获取认证令牌
   */
  getToken(): string | null;

  /**
   * Refresh authentication token
   * 刷新认证令牌
   */
  refreshToken(): Promise<boolean>;

  /**
   * Logout and clear authentication
   * 登出并清除认证
   */
  logout(): Promise<boolean>;
}

export default IAuthManager;