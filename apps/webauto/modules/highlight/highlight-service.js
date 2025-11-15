/**
 * WebAuto 统一高亮服务
 * 提供抗CSS干扰、动态跟随、失败回退的强化高亮功能
 */
export class HighlightService {
  constructor() {
    this.activeHighlights = new Map();
    this.nextId = 1;
  }

  /**
   * 创建强化高亮效果
   * @param {Element} element - 要高亮的元素
   * @param {Object} config - 高亮配置
   * @param {string} config.color - 高亮颜色 (默认: #ff3b30)
   * @param {string} config.label - 标签文本 (默认: TARGET)
   * @param {number} config.duration - 持续时间毫秒 (默认: 8000)
   * @param {boolean} config.persist - 是否持久化 (默认: false)
   * @param {boolean} config.scrollIntoView - 是否滚动到视口 (默认: true)
   * @param {string} config.alias - 别名用于管理
   * @returns {number} 高亮ID
   */
  createHighlight(element, config = {}) {
    if (!element) {
      console.warn('HighlightService: 无效的元素');
      return null;
    }

    const id = this.nextId++;
    const finalConfig = {
      color: config.color || '#ff3b30',
      label: config.label || 'TARGET',
      duration: config.duration || 8000,
      persist: config.persist || false,
      scrollIntoView: config.scrollIntoView !== false,
      alias: config.alias || `highlight-${id}`,
      ...config
    };

    try {
      // 滚动到视口中心
      if (finalConfig.scrollIntoView) {
        element.scrollIntoView({ behavior: 'instant', block: 'center' });
      }

      // 创建高亮效果
      const highlightData = this.createHighlightElements(element, finalConfig);

      // 设置动态跟随
      this.setupDynamicFollow(element, highlightData, finalConfig);

      // 设置清理定时器
      this.setupCleanup(highlightData, finalConfig, id);

      // 存储高亮数据
      this.activeHighlights.set(id, {
        element,
        ...highlightData,
        config: finalConfig
      });

      console.log(`✨ 创建高亮效果: ${finalConfig.alias} (ID: ${id})`);
      return id;

    } catch (error) {
      console.error('❌ 高亮创建失败:', error);
      return null;
    }
  }

  /**
   * 创建高亮DOM元素
   */
  createHighlightElements(element, config) {
    const rect = element.getBoundingClientRect();

    // 1. 创建外层覆盖框
    const overlay = document.createElement('div');
    overlay.className = '__webauto_anchor_overlay__';
    overlay.style.setProperty('all', 'initial', 'important');
    overlay.style.setProperty('position', 'fixed', 'important');
    overlay.style.setProperty('left', `${rect.left - 4}px`, 'important');
    overlay.style.setProperty('top', `${rect.top - 4}px`, 'important');
    overlay.style.setProperty('width', `${rect.width + 8}px`, 'important');
    overlay.style.setProperty('height', `${rect.height + 8}px`, 'important');
    overlay.style.setProperty('border', `4px solid ${config.color}`, 'important');
    overlay.style.setProperty('border-radius', '8px', 'important');
    overlay.style.setProperty('background', `${this.hexToRgba(config.color, 0.1)}`, 'important');
    overlay.style.setProperty('pointer-events', 'none', 'important');
    overlay.style.setProperty('z-index', '2147483647', 'important');
    overlay.style.setProperty('box-sizing', 'border-box', 'important');
    overlay.style.setProperty('box-shadow', `0 0 20px ${this.hexToRgba(config.color, 0.6)}`, 'important');

    // 2. 创建标签
    const label = document.createElement('div');
    label.className = '__webauto_anchor_label__';
    label.textContent = config.label;
    label.style.setProperty('all', 'initial', 'important');
    label.style.setProperty('position', 'fixed', 'important');
    label.style.setProperty('left', `${rect.left + rect.width / 2 - 30}px`, 'important');
    label.style.setProperty('top', `${Math.max(6, rect.top - 25)}px`, 'important');
    label.style.setProperty('background', config.color, 'important');
    label.style.setProperty('color', '#ffffff', 'important');
    label.style.setProperty('padding', '4px 8px', 'important');
    label.style.setProperty('border-radius', '4px', 'important');
    label.style.setProperty('font-size', '12px', 'important');
    label.style.setProperty('font-weight', 'bold', 'important');
    label.style.setProperty('z-index', '2147483647', 'important');
    label.style.setProperty('box-shadow', '0 2px 8px rgba(0,0,0,0.4)', 'important');
    label.style.setProperty('white-space', 'nowrap', 'important');

    // 3. 元素本身的高亮样式
    const originalStyles = {
      outline: element.style.outline,
      outlineOffset: element.style.outlineOffset,
      boxShadow: element.style.boxShadow,
      transition: element.style.transition
    };

    element.style.setProperty('outline', `3px solid ${config.color}`, 'important');
    element.style.setProperty('outline-offset', '0', 'important');
    element.style.setProperty('box-shadow', `0 0 0 2px ${this.hexToRgba(config.color, 0.35)}`, 'important');
    element.style.setProperty('transition', 'all 0.3s ease', 'important');

    // 4. 添加动画
    this.addAnimations(overlay, label, config.color);

    // 5. 添加到页面
    document.body.appendChild(overlay);
    document.body.appendChild(label);

    return {
      overlay,
      label,
      originalStyles
    };
  }

  /**
   * 设置动态跟随
   */
  setupDynamicFollow(element, highlightData, config) {
    let rafId = null;
    let intervalId = null;

    const updatePositions = () => {
      try {
        const rect = element.getBoundingClientRect();

        // 检查元素是否还在DOM中
        if (!document.contains(element)) {
          console.warn('⚠️ 元素已从DOM中移除，停止动态跟随');
          return;
        }

        // 更新覆盖框位置
        if (highlightData.overlay && highlightData.overlay.parentNode) {
          highlightData.overlay.style.setProperty('left', `${rect.left - 4}px`, 'important');
          highlightData.overlay.style.setProperty('top', `${rect.top - 4}px`, 'important');
          highlightData.overlay.style.setProperty('width', `${rect.width + 8}px`, 'important');
          highlightData.overlay.style.setProperty('height', `${rect.height + 8}px`, 'important');
        }

        // 更新标签位置
        if (highlightData.label && highlightData.label.parentNode) {
          highlightData.label.style.setProperty('left', `${rect.left + rect.width / 2 - 30}px`, 'important');
          highlightData.label.style.setProperty('top', `${Math.max(6, rect.top - 25)}px`, 'important');
        }

      } catch (error) {
        console.warn('⚠️ 动态跟随更新失败:', error);
      }
    };

    // 监听滚动和resize事件
    const handleUpdate = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updatePositions);
    };

    window.addEventListener('scroll', handleUpdate, { passive: true });
    window.addEventListener('resize', handleUpdate, { passive: true });

    // 定时更新（作为备用机制）
    const updateInterval = config.persist ? 1000 : 200;
    intervalId = setInterval(updatePositions, updateInterval);

    // 存储清理函数
    highlightData.cleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('scroll', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
    };
  }

  /**
   * 设置清理定时器
   */
  setupCleanup(highlightData, config, id) {
    if (config.persist) {
      // 持久化模式，不自动清理
      return;
    }

    setTimeout(() => {
      this.removeHighlight(id);
    }, config.duration);
  }

  /**
   * 移除高亮
   */
  removeHighlight(id) {
    const highlightData = this.activeHighlights.get(id);
    if (!highlightData) return;

    try {
      // 恢复元素原始样式
      if (highlightData.element && highlightData.originalStyles) {
        Object.assign(highlightData.element.style, highlightData.originalStyles);
      }

      // 移除覆盖框和标签
      if (highlightData.overlay && highlightData.overlay.parentNode) {
        highlightData.overlay.parentNode.removeChild(highlightData.overlay);
      }

      if (highlightData.label && highlightData.label.parentNode) {
        highlightData.label.parentNode.removeChild(highlightData.label);
      }

      // 清理动态跟随
      if (highlightData.cleanup) {
        highlightData.cleanup();
      }

      // 移除动画样式
      this.removeAnimations();

      // 从存储中删除
      this.activeHighlights.delete(id);

      console.log(`🧹 移除高亮效果: ${highlightData.config.alias} (ID: ${id})`);

    } catch (error) {
      console.error('❌ 移除高亮失败:', error);
    }
  }

  /**
   * 移除所有高亮
   */
  removeAllHighlights() {
    const ids = Array.from(this.activeHighlights.keys());
    ids.forEach(id => this.removeHighlight(id));
  }

  /**
   * 基于坐标创建高亮（回退方案）
   */
  createHighlightFromRect(rect, config = {}) {
    const finalConfig = {
      color: config.color || '#ff3b30',
      label: config.label || 'TARGET',
      duration: config.duration || 8000,
      alias: config.alias || 'rect-highlight',
      ...config
    };

    const overlay = document.createElement('div');
    overlay.className = '__webauto_anchor_overlay__';
    overlay.style.setProperty('all', 'initial', 'important');
    overlay.style.setProperty('position', 'fixed', 'important');
    overlay.style.setProperty('left', `${rect.x - 4}px`, 'important');
    overlay.style.setProperty('top', `${rect.y - 4}px`, 'important');
    overlay.style.setProperty('width', `${rect.width + 8}px`, 'important');
    overlay.style.setProperty('height', `${rect.height + 8}px`, 'important');
    overlay.style.setProperty('border', `4px solid ${finalConfig.color}`, 'important');
    overlay.style.setProperty('border-radius', '8px', 'important');
    overlay.style.setProperty('background', `${this.hexToRgba(finalConfig.color, 0.1)}`, 'important');
    overlay.style.setProperty('pointer-events', 'none', 'important');
    overlay.style.setProperty('z-index', '2147483647', 'important');
    overlay.style.setProperty('box-shadow', `0 0 20px ${this.hexToRgba(finalConfig.color, 0.6)}`, 'important');

    // 添加标签
    const label = document.createElement('div');
    label.textContent = finalConfig.label;
    label.style.setProperty('all', 'initial', 'important');
    label.style.setProperty('position', 'fixed', 'important');
    label.style.setProperty('left', `${rect.x + rect.width / 2 - 30}px`, 'important');
    label.style.setProperty('top', `${Math.max(6, rect.y - 25)}px`, 'important');
    label.style.setProperty('background', finalConfig.color, 'important');
    label.style.setProperty('color', '#ffffff', 'important');
    label.style.setProperty('padding', '4px 8px', 'important');
    label.style.setProperty('border-radius', '4px', 'important');
    label.style.setProperty('font-size', '12px', 'important');
    label.style.setProperty('font-weight', 'bold', 'important');
    label.style.setProperty('z-index', '2147483647', 'important');

    document.body.appendChild(overlay);
    document.body.appendChild(label);

    // 设置清理
    setTimeout(() => {
      try {
        overlay.remove();
        label.remove();
      } catch {}
    }, finalConfig.duration);

    return { overlay, label };
  }

  /**
   * 添加动画效果
   */
  addAnimations(overlay, label, color) {
    if (!document.querySelector('#webauto-highlight-animations')) {
      const style = document.createElement('style');
      style.id = 'webauto-highlight-animations';
      style.textContent = `
        @keyframes webauto-highlight-pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.02); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes webauto-highlight-glow {
          0% { box-shadow: 0 0 20px ${this.hexToRgba(color, 0.6)}; }
          50% { box-shadow: 0 0 40px ${this.hexToRgba(color, 0.9)}; }
          100% { box-shadow: 0 0 20px ${this.hexToRgba(color, 0.6)}; }
        }
        @keyframes webauto-label-bounce {
          0% { transform: translateY(-10px); opacity: 0; }
          60% { transform: translateY(2px); }
          100% { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    overlay.style.setProperty('animation', 'webauto-highlight-pulse 2s infinite', 'important');
    label.style.setProperty('animation', 'webauto-label-bounce 0.5s ease-out', 'important');
  }

  /**
   * 移除动画样式
   */
  removeAnimations() {
    // 动画样式保留，不删除
  }

  /**
   * 颜色转换工具
   */
  hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * 获取高亮统计信息
   */
  getStats() {
    const overlays = document.querySelectorAll('.__webauto_anchor_overlay__');
    const labels = document.querySelectorAll('.__webauto_anchor_label__');

    return {
      activeHighlights: this.activeHighlights.size,
      overlayElements: overlays.length,
      labelElements: labels.length,
      totalElements: overlays.length + labels.length
    };
  }
}

// 创建全局高亮服务实例
window.__webautoHighlight = new HighlightService();

// 导出服务
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HighlightService };
}