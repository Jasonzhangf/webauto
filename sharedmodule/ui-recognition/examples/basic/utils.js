/**
 * Test Utilities
 * 测试工具函数
 */

/**
 * 创建模拟的base64图像数据
 * 生成一个简单的彩色图像用于测试
 */
export function createDummyImage() {
  // 创建一个简单的PNG图像的base64编码
  // 这是一个1x1像素的透明PNG图像
  const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  // 创建一个稍大一点的测试图像 (模拟网页截图)
  // 这是一个简单的彩色矩形图像
  const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAMElEQVR42mP8//8/AyIiMjJ6RURERHGBkYGhhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWBgYGBkZGRkAAAAA//8DAJcFMBsKAAAAAElFTkSuQmCC';

  return testImageBase64;
}

/**
 * 创建更复杂的测试图像
 * 模拟一个包含多个UI元素的网页截图
 */
export function createComplexTestImage() {
  // 返回一个较大的模拟图像base64字符串
  // 这里使用一个简单的彩色块图像作为示例
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAGElEQVQYlWNgYGCQwoKxgqGgcJA5h3yFAAs8BRWVSwooAAAAAElFTkSuQmCC';
}

/**
 * 生成随机base64图像数据
 */
export function generateRandomImage(size = 100) {
  // 生成随机图像数据的base64字符串
  const randomData = Array.from({ length: size }, () =>
    String.fromCharCode(Math.floor(Math.random() * 256))
  ).join('');

  return btoa(randomData);
}

/**
 * 创建测试用的HTML页面截图base64
 */
export function createHTMLScreenshot() {
  // 模拟一个包含常见UI元素的页面截图
  return createDummyImage(); // 暂时使用简单图像
}

/**
 * 验证base64图像格式
 */
export function isValidBase64Image(imageString) {
  if (!imageString || typeof imageString !== 'string') {
    return false;
  }

  // 检查是否以data:image开头
  if (imageString.startsWith('data:image')) {
    return true;
  }

  // 检查是否是有效的base64格式
  try {
    const decoded = atob(imageString);
    return decoded.length > 0;
  } catch (e) {
    return false;
  }
}

/**
 * 计算base64图像大小
 */
export function getImageSize(base64String) {
  if (!base64String) return 0;

  // 移除data URL前缀
  const base64Data = base64String.includes(',')
    ? base64String.split(',')[1]
    : base64String;

  // Base64编码后的数据大小是原始数据的4/3
  const byteLength = Math.floor(base64Data.length * 0.75);
  return byteLength;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}