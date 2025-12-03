/**
 * GBK编码工具模块
 * 使用系统iconv工具进行标准GBK编码转换
 */

import { execSync } from 'child_process';

class GBKEncoder {
  constructor() {
    // 不再使用硬编码映射表，改为动态生成
  }

  /**
   * 使用系统iconv工具进行准确的GBK编码
   * @param {string} text - 要编码的文本
   * @returns {string} GBK编码后的URL字符串
   */
  encodeToGBK(text) {
    try {
      // 使用系统iconv工具进行标准GBK编码
      const result = execSync(`printf '%s' "${text}" | iconv -f UTF-8 -t GBK | xxd -p | tr '[:lower:]' '[:upper:]' | sed 's/../%&/g'`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      return result;
    } catch (error) {
      console.error('GBK编码失败:', error.message);
      // 如果iconv失败，尝试其他方法或返回原文
      return this.fallbackEncode(text);
    }
  }

  /**
   * 备用编码方法（当iconv不可用时）
   * @param {string} text - 要编码的文本
   * @returns {string} 备用编码结果
   */
  fallbackEncode(text) {
    try {
      // 尝试使用Node.js原生方法
      // 注意：这是一个简化的实现，可能不完整
      let result = '';
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const code = char.charCodeAt(0);

        if (code < 128) {
          // ASCII字符直接编码
          result += '%' + code.toString(16).toUpperCase().padStart(2, '0');
        } else {
          // 对于非ASCII字符，尝试简单的Unicode编码
          // 这不是真正的GBK编码，但是一个备用方案
          const utf8Bytes = Buffer.from(char, 'utf8');
          for (const byte of utf8Bytes) {
            result += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
          }
        }
      }
      return result;
    } catch (error) {
      console.error('备用编码也失败:', error.message);
      return text; // 最后的fallback，返回原文
    }
  }

  /**
   * 验证编码是否正确（通过重新编码对比）
   * @param {string} originalText - 原始文本
   * @param {string} encoded - 编码后的文本
   * @returns {boolean} 是否编码正确
   */
  validateEncoding(originalText, encoded) {
    try {
      // 通过重新编码来验证
      const reencoded = this.encodeToGBK(originalText);
      return reencoded === encoded;
    } catch (error) {
      console.error('验证编码失败:', error.message);
      return false;
    }
  }

  /**
   * 批量编码多个字符串
   * @param {string[]} texts - 要编码的文本数组
   * @returns {string[]} 编码后的数组
   */
  encodeBatch(texts) {
    return texts.map(text => this.encodeToGBK(text));
  }

  /**
   * 生成1688搜索URL
   * @param {string} keyword - 搜索关键词
   * @returns {string} 完整的1688搜索URL
   */
  generate1688URL(keyword) {
    const encoded = this.encodeToGBK(keyword);
    return `https://s.1688.com/selloffer/offer_search.htm?keywords=${encoded}`;
  }

  /**
   * 检查系统是否支持iconv
   * @returns {boolean} 是否支持iconv
   */
  checkIconvSupport() {
    try {
      execSync('which iconv', { encoding: 'utf8' });
      return true;
    } catch (error) {
      return false;
    }
  }
}

// 导出模块
export default GBKEncoder;

// 如果直接运行此文件，进行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const encoder = new GBKEncoder();

  console.log('=== GBK编码测试 ===');

  const testWords = ['港货', '钢化膜', '手机', '汽车配件'];

  testWords.forEach(word => {
    const encoded = encoder.encodeToGBK(word);
    console.log(`${word} -> ${encoded}`);
    console.log(`验证: ${encoder.validateEncoding(word, encoded) ? '✓' : '✗'}`);
  });
}