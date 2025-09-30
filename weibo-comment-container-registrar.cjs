#!/usr/bin/env node

/**
 * 微博评论区容器注册器
 * 将评论区分析发现的精确容器独立注册到容器库中
 */

const fs = require('fs');

class WeiboCommentContainerRegistrar {
  constructor() {
    this.containerLibraryPath = './container-library.json';
    this.backupLibraryPath = './container-library-backup.json';
    this.commentContainers = this.getCommentContainers();
  }

  /**
   * 定义从评论区分析发现的精确容器
   */
  getCommentContainers() {
    return {
      // 评论区基础容器
      comment_icon_trigger: {
        name: "评论图标触发器",
        selector: ".woo-font.woo-font--comment.toolbar_commentIcon_3o7HB",
        description: "点击进入评论区的评论图标按钮",
        priority: 6,
        specificity: 1000,
        type: "interactive",
        action: "click"
      },

      // 加载更多相关容器
      load_more_dropdown: {
        name: "加载更多下拉菜单",
        selector: ".woo-pop-wrap.morepop_more_3ssan",
        description: "显示更多选项的下拉菜单容器",
        priority: 7,
        specificity: 1010,
        type: "container",
        interaction: "dropdown"
      },

      load_more_icon: {
        name: "加载更多图标按钮",
        selector: ".woo-box-flex.woo-box-alignCenter.woo-box-justifyCenter.morepop_moreIcon_1RvP9",
        description: "点击展开更多选项的图标按钮",
        priority: 8,
        specificity: 1020,
        type: "interactive",
        action: "click"
      },

      loading_spinner: {
        name: "加载动画指示器",
        selector: ".woo-spinner-main.Scroll_loadingIcon_2nyZ4",
        description: "内容加载时的旋转动画指示器",
        priority: 9,
        specificity: 1000,
        type: "indicator",
        state: "loading"
      },

      // 分页相关容器
      next_page_button: {
        name: "下一页按钮",
        selector: ".woo-box-flex.woo-box-alignCenter.woo-box-justifyCenter.Scroll_nextPage_UOGEz",
        description: "加载下一页内容的按钮容器",
        priority: 10,
        specificity: 1010,
        type: "interactive",
        action: "click"
      },

      // 虚拟滚动容器
      virtual_scroller: {
        name: "虚拟滚动容器",
        selector: ".vue-recycle-scroller.ready.page-mode.direction-vertical",
        description: "Vue虚拟滚动技术的页面容器，用于高效加载大量内容",
        priority: 11,
        specificity: 1010,
        type: "container",
        technology: "vue-virtual-scroller"
      },

      scroller_wrapper: {
        name: "滚动包装器",
        selector: "#scroller",
        description: "页面主要滚动容器的ID标识",
        priority: 12,
        specificity: 1000,
        type: "container",
        identifier: "id"
      },

      // 展开相关容器
      expand_button: {
        name: "展开回复按钮",
        selector: ".expand",
        description: "展开被折叠的回复评论的按钮",
        priority: 13,
        specificity: 100,
        type: "interactive",
        action: "click",
        textContent: "展开"
      },

      // 评论内容容器
      comment_content_area: {
        name: "评论内容区域",
        selector: "[class*='comment']:not(.toolbar_commentIcon_3o7HB)",
        description: "包含实际评论内容的区域容器",
        priority: 14,
        specificity: 40,
        type: "container",
        exclude: [".toolbar_commentIcon_3o7HB"]
      },

      // 回复嵌套容器
      reply_nested_container: {
        name: "回复嵌套容器",
        selector: "[class*='reply'][class*='nested'], [class*='sub'][class*='comment']",
        description: "包含嵌套回复评论的容器",
        priority: 15,
        specificity: 80,
        type: "container",
        structure: "nested"
      }
    };
  }

  /**
   * 备份当前容器库
   */
  backupContainerLibrary() {
    try {
      const libraryData = fs.readFileSync(this.containerLibraryPath, 'utf8');
      fs.writeFileSync(this.backupLibraryPath, libraryData);
      console.log('💾 容器库备份完成');
      return true;
    } catch (error) {
      console.error('❌ 容器库备份失败:', error.message);
      return false;
    }
  }

  /**
   * 读取当前容器库
   */
  readContainerLibrary() {
    try {
      const data = fs.readFileSync(this.containerLibraryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ 读取容器库失败:', error.message);
      return null;
    }
  }

  /**
   * 计算选择器特异性
   */
  calculateSelectorSpecificity(selector) {
    const idCount = (selector.match(/#/g) || []).length;
    const classCount = (selector.match(/\./g) || []).length;
    const attrCount = (selector.match(/\[/g) || []).length;
    const tagCount = (selector.match(/^[a-zA-Z]+/g) || []).length;
    return idCount * 1000 + classCount * 100 + attrCount * 10 + tagCount;
  }

  /**
   * 注册评论容器到容器库
   */
  registerCommentContainers() {
    console.log('🔧 开始注册评论区容器...');

    // 备份现有容器库
    if (!this.backupContainerLibrary()) {
      return false;
    }

    const library = this.readContainerLibrary();
    if (!library) {
      return false;
    }

    // 确保weibo网站容器存在
    if (!library.weibo) {
      library.weibo = {
        website: "weibo.com",
        registeredAt: new Date().toISOString(),
        containers: {},
        metadata: {
          version: "2.0.0",
          lastUpdated: new Date().toISOString(),
          containerCount: 0
        }
      };
    }

    let registeredCount = 0;

    // 注册每个评论容器
    for (const [containerId, containerInfo] of Object.entries(this.commentContainers)) {
      try {
        // 验证选择器特异性
        const specificity = containerInfo.specificity || this.calculateSelectorSpecificity(containerInfo.selector);

        // 创建容器注册信息
        const registeredContainer = {
          name: containerInfo.name,
          selector: containerInfo.selector,
          description: containerInfo.description,
          priority: containerInfo.priority,
          specificity: specificity,
          registeredAt: new Date().toISOString(),
          isActive: true,
          type: containerInfo.type || "container",
          usage: {
            accessCount: 0,
            lastUsed: null,
            successRate: 0
          },
          validation: {
            selectorValid: true,
            lastValidation: new Date().toISOString(),
            validationMethod: "comment-analysis"
          },
          discovery: {
            strategy: "precise-selector",
            specificityThreshold: 100,
            uniquenessThreshold: 0.8,
            waitForElements: true,
            timeout: 10000
          }
        };

        // 添加额外的元数据
        if (containerInfo.action) {
          registeredContainer.action = containerInfo.action;
        }
        if (containerInfo.interaction) {
          registeredContainer.interaction = containerInfo.interaction;
        }
        if (containerInfo.state) {
          registeredContainer.state = containerInfo.state;
        }
        if (containerInfo.technology) {
          registeredContainer.technology = containerInfo.technology;
        }
        if (containerInfo.structure) {
          registeredContainer.structure = containerInfo.structure;
        }
        if (containerInfo.exclude) {
          registeredContainer.exclude = containerInfo.exclude;
        }

        // 检查是否已存在
        if (library.weibo.containers[containerId]) {
          console.log(`⚠️ 容器 ${containerId} 已存在，将覆盖更新`);
        }

        // 注册容器
        library.weibo.containers[containerId] = registeredContainer;
        registeredCount++;

        console.log(`✅ 注册容器: ${containerId} - ${containerInfo.name}`);
        console.log(`   选择器: ${containerInfo.selector}`);
        console.log(`   特异性: ${specificity}`);
        console.log(`   类型: ${containerInfo.type || 'container'}`);
        if (containerInfo.action) {
          console.log(`   动作: ${containerInfo.action}`);
        }

      } catch (error) {
        console.error(`❌ 注册容器 ${containerId} 失败:`, error.message);
      }
    }

    // 更新元数据
    const totalContainers = Object.keys(library.weibo.containers).length;
    library.weibo.metadata.lastUpdated = new Date().toISOString();
    library.weibo.metadata.containerCount = totalContainers;

    // 保存更新后的容器库
    try {
      fs.writeFileSync(this.containerLibraryPath, JSON.stringify(library, null, 2));
      console.log(`\n🎉 评论区容器注册完成！`);
      console.log(`📊 注册统计:`);
      console.log(`   - 新注册容器: ${registeredCount}`);
      console.log(`   - 总容器数量: ${totalContainers}`);
      console.log(`   - 容器库文件: ${this.containerLibraryPath}`);
      console.log(`   - 备份文件: ${this.backupLibraryPath}`);

      return true;
    } catch (error) {
      console.error('❌ 保存容器库失败:', error.message);
      return false;
    }
  }

  /**
   * 验证注册的容器
   */
  validateRegisteredContainers() {
    console.log('\n🔍 验证已注册的评论区容器...');

    const library = this.readContainerLibrary();
    if (!library || !library.weibo) {
      console.log('❌ 容器库无效');
      return false;
    }

    const containers = library.weibo.containers;
    const commentContainerIds = Object.keys(this.commentContainers);

    let validCount = 0;
    let invalidCount = 0;

    for (const containerId of commentContainerIds) {
      const container = containers[containerId];
      if (container) {
        // 验证必需字段
        const requiredFields = ['name', 'selector', 'description', 'priority', 'specificity'];
        const missingFields = requiredFields.filter(field => !container[field]);

        if (missingFields.length === 0) {
          console.log(`✅ ${containerId}: ${container.name}`);
          validCount++;
        } else {
          console.log(`❌ ${containerId}: 缺少字段 ${missingFields.join(', ')}`);
          invalidCount++;
        }
      } else {
        console.log(`❌ ${containerId}: 未找到`);
        invalidCount++;
      }
    }

    console.log(`\n📋 验证结果:`);
    console.log(`   - 有效容器: ${validCount}`);
    console.log(`   - 无效容器: ${invalidCount}`);
    console.log(`   - 验证率: ${((validCount / (validCount + invalidCount)) * 100).toFixed(1)}%`);

    return invalidCount === 0;
  }

  /**
   * 生成容器使用指南
   */
  generateUsageGuide() {
    console.log('\n📖 评论区容器使用指南');
    console.log('==========================');

    for (const [containerId, containerInfo] of Object.entries(this.commentContainers)) {
      console.log(`\n🔹 ${containerInfo.name} (${containerId})`);
      console.log(`   选择器: ${containerInfo.selector}`);
      console.log(`   描述: ${containerInfo.description}`);
      console.log(`   优先级: ${containerInfo.priority}`);

      if (containerInfo.action) {
        console.log(`   操作: ${containerInfo.action}`);
      }
      if (containerInfo.type && containerInfo.type !== 'container') {
        console.log(`   类型: ${containerInfo.type}`);
      }
      if (containerInfo.interaction) {
        console.log(`   交互: ${containerInfo.interaction}`);
      }
    }

    console.log('\n💡 使用建议:');
    console.log('1. 评论图标触发器 -> 点击进入评论区');
    console.log('2. 加载更多按钮 -> 展开更多评论选项');
    console.log('3. 展开回复按钮 -> 查看嵌套回复');
    console.log('4. 虚拟滚动容器 -> 处理大量评论内容');
    console.log('5. 加载动画指示器 -> 判断内容加载状态');
  }
}

// 命令行执行
if (require.main === module) {
  const registrar = new WeiboCommentContainerRegistrar();

  console.log('🏗️ 微博评论区容器注册系统');
  console.log('=============================');

  // 注册容器
  const registrationSuccess = registrar.registerCommentContainers();

  if (registrationSuccess) {
    // 验证注册结果
    const validationSuccess = registrar.validateRegisteredContainers();

    if (validationSuccess) {
      // 生成使用指南
      registrar.generateUsageGuide();

      console.log('\n🎯 评论区容器注册完成！');
      console.log('所有发现的评论区容器都已成功注册到容器库中。');
    } else {
      console.log('\n⚠️ 部分容器验证失败，请检查注册结果。');
    }
  } else {
    console.log('\n❌ 容器注册失败，请检查错误信息。');
    process.exit(1);
  }
}

module.exports = WeiboCommentContainerRegistrar;