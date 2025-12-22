/**
 * Browser 模块统一入口
 * 导出：
 *  - BrowserService：HTTP 通信
 *  - BrowserHealthHandshake：健康握手验证
 *  - BrowserHealthCommunicator：通信验证
 *  - BrowserHealthValidator：完整健康验证
 *  - BrowserContainerMatcher：容器匹配
 */

export { BrowserService } from './service.mjs';
export { BrowserHealthHandshake } from './health/handshake.mjs';
export { BrowserHealthCommunicator } from './health/communicator.mjs';
export { BrowserHealthValidator } from './health/validator.mjs';
export { BrowserContainerMatcher } from './container/matcher.mjs';
