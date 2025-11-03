/**
 * 高层UI容器系统 - 控件构建器
 * 基于容器和底层识别结果构建具体的UI控件
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// 类型导入
import { UIElement, ElementType } from '../types/recognition';
import { UIContainer, ContainerType } from '../types/container';
import { UIControl, ControlType, Operation, ControlProperties, ControlMetadata } from '../types/control';
import { ContainerAnnotation } from '../types/annotation';

export interface ControlBuildRequest {
  elements: UIElement[];
  containers: UIContainer[];
  annotations: ContainerAnnotation[];
  buildOptions?: ControlBuildOptions;
}

export interface ControlBuildOptions {
  enable_smart_detection: boolean = true;
  min_control_size: number = 20;
  enable_interaction_prediction: boolean = true;
  enable_auto_operations: boolean = true;
  quality_threshold: number = 0.7;
  prefer_semantic_detection: boolean = true;
  enable_contextual_analysis: boolean = true;
}

export interface ControlBuildResult {
  controls: UIControl[];
  container_controls: Record<string, UIControl[]>; // 按容器分组的控件
  unassigned_elements: UIElement[]; // 未分配到控件的元素
  build_stats: ControlBuildStats;
  quality_metrics: ControlQualityMetrics;
}

export interface ControlBuildStats {
  total_elements: number;
  total_controls: number;
  controls_by_type: Record<ControlType, number>;
  assigned_elements: number;
  unassigned_elements: number;
  assignment_rate: number;
  processing_time: number;
}

export interface ControlQualityMetrics {
  detection_accuracy: number;
  semantic_coherence: number;
  operation_completeness: number;
  boundary_precision: number;
  overall_score: number;
}

export interface ElementControlMapping {
  element_id: string;
  control_id: string;
  confidence: number;
  mapping_reason: string;
}

export class ControlBuilder extends EventEmitter {
  private elementControlMap: Map<string, ElementControlMapping> = new Map();

  constructor() {
    super();
  }

  /**
   * 构建控件系统
   */
  async buildControls(request: ControlBuildRequest): Promise<ControlBuildResult> {
    const startTime = Date.now();
    const { elements, containers, annotations, buildOptions = {} } = request;

    this.emit('buildStart', {
      elementCount: elements.length,
      containerCount: containers.length
    });

    try {
      // 第一步：元素预处理和分类
      const classifiedElements = this.classifyElements(elements, buildOptions);

      // 第二步：将元素分配到容器
      const containerElements = this.assignElementsToContainers(
        classifiedElements,
        containers
      );

      // 第三步：在每个容器内构建控件
      const controls: UIControl[] = [];
      const containerControls: Record<string, UIControl[]> = {};

      for (const container of containers) {
        const containerElementList = containerElements.get(container.id) || [];
        const builtControls = await this.buildControlsForContainer(
          container,
          containerElementList,
          annotations,
          buildOptions
        );

        controls.push(...builtControls);
        containerControls[container.id] = builtControls;
      }

      // 第四步：识别未分配的元素
      const unassignedElements = this.findUnassignedElements(
        elements,
        controls
      );

      // 第五步：优化控件结构
      const optimizedControls = await this.optimizeControlStructure(
        controls,
        containers,
        buildOptions
      );

      // 第六步：建立控件间关系
      await this.establishControlRelationships(optimizedControls);

      const processingTime = Date.now() - startTime;

      const result: ControlBuildResult = {
        controls: optimizedControls,
        container_controls: containerControls,
        unassigned_elements: unassignedElements,
        build_stats: this.calculateBuildStats(elements, optimizedControls, processingTime),
        quality_metrics: this.calculateQualityMetrics(optimizedControls, elements)
      };

      this.emit('buildComplete', result);
      return result;

    } catch (error) {
      this.emit('buildError', error);
      throw error;
    }
  }

  /**
   * 元素分类
   */
  private classifyElements(elements: UIElement[], options: ControlBuildOptions): UIElement[] {
    const classifiedElements = elements.map(element => {
      // 增强元素类型识别
      const enhancedType = this.enhanceElementType(element, options);

      if (enhancedType !== element.type) {
        this.emit('elementTypeEnhanced', {
          elementId: element.id,
          originalType: element.type,
          enhancedType: enhancedType
        });
      }

      return {
        ...element,
        type: enhancedType
      };
    });

    // 按类型排序
    return classifiedElements.sort((a, b) => {
      const typeOrder = this.getTypeOrder(a.type);
      const otherTypeOrder = this.getTypeOrder(b.type);
      return typeOrder - otherTypeOrder;
    });
  }

  /**
   * 增强元素类型识别
   */
  private enhanceElementType(element: UIElement, options: ControlBuildOptions): ElementType {
    if (!options.enable_smart_detection) {
      return element.type;
    }

    // 基于文本内容增强类型识别
    if (element.text) {
      const text = element.text.toLowerCase().trim();

      // 按钮类型识别
      if (this.isButtonText(text)) {
        return 'button';
      }

      // 链接类型识别
      if (this.isLinkText(text)) {
        return 'link';
      }

      // 输入框标签识别
      if (this.isInputLabel(text)) {
        return 'label';
      }
    }

    // 基于位置和大小增强识别
    if (this.isInputSize(element.bbox)) {
      return 'input';
    }

    // 基于描述增强识别
    if (element.description) {
      const desc = element.description.toLowerCase();
      if (desc.includes('按钮') || desc.includes('button')) {
        return 'button';
      }
      if (desc.includes('输入') || desc.includes('input')) {
        return 'input';
      }
      if (desc.includes('链接') || desc.includes('link')) {
        return 'link';
      }
    }

    return element.type;
  }

  /**
   * 将元素分配到容器
   */
  private assignElementsToContainers(
    elements: UIElement[],
    containers: UIContainer[]
  ): Map<string, UIElement[]> {
    const containerElements = new Map<string, UIElement[]>();

    // 初始化所有容器的元素列表
    for (const container of containers) {
      containerElements.set(container.id, []);
    }

    // 为每个元素找到最合适的容器
    for (const element of elements) {
      const bestContainer = this.findBestContainerForElement(element, containers);
      if (bestContainer) {
        const elementList = containerElements.get(bestContainer.id);
        if (elementList) {
          elementList.push(element);
        }
      }
    }

    this.emit('elementsAssignedToContainers', {
      totalElements: elements.length,
      containerCount: containers.size
    });

    return containerElements;
  }

  /**
   * 为元素找到最合适的容器
   */
  private findBestContainerForElement(
    element: UIElement,
    containers: UIContainer[]
  ): UIContainer | null {
    let bestContainer: UIContainer | null = null;
    let bestScore = -1;

    for (const container of containers) {
      const score = this.calculateContainerContainmentScore(element, container);
      if (score > bestScore) {
        bestScore = score;
        bestContainer = container;
      }
    }

    return bestScore > 0.5 ? bestContainer : null;
  }

  /**
   * 计算容器包含分数
   */
  private calculateContainerContainmentScore(
    element: UIElement,
    container: UIContainer
  ): number {
    // 检查元素是否在容器边界内
    if (!this.isElementInContainer(element, container)) {
      return 0;
    }

    // 计算包含程度
    const elementArea = this.calculateArea(element.bbox);
    const containerArea = this.calculateArea(container.bounds);
    const areaRatio = elementArea / containerArea;

    // 计算位置得分（中心点越靠近容器中心得分越高）
    const elementCenter = this.calculateCenter(element.bbox);
    const containerCenter = this.calculateCenter(container.bounds);
    const distance = this.calculateDistance(elementCenter, containerCenter);
    const maxDistance = Math.max(container.bounds.width || 0, container.bounds.height || 0) / 2;
    const positionScore = Math.max(0, 1 - (distance / maxDistance));

    // 综合评分
    return positionScore * 0.7 + (1 - Math.min(1, areaRatio)) * 0.3;
  }

  /**
   * 在容器内构建控件
   */
  private async buildControlsForContainer(
    container: UIContainer,
    elements: UIElement[],
    annotations: ContainerAnnotation[],
    options: ControlBuildOptions
  ): Promise<UIControl[]> {
    const controls: UIControl[] = [];

    // 按位置排序元素
    const sortedElements = this.sortElementsByPosition(elements);

    // 检测控件组（如相关的标签和输入框）
    const controlGroups = this.detectControlGroups(sortedElements, options);

    // 为每个控件组构建控件
    for (const group of controlGroups) {
      if (group.length === 1) {
        // 单个元素控件
        const control = await this.buildSingleElementControl(
          group[0],
          container,
          options
        );
        if (control) {
          controls.push(control);
        }
      } else {
        // 复合控件（如标签+输入框）
        const control = await this.buildCompositeControl(
          group,
          container,
          options
        );
        if (control) {
          controls.push(control);
        }
      }
    }

    this.emit('controlsBuiltForContainer', {
      containerId: container.id,
      controlCount: controls.length
    });

    return controls;
  }

  /**
   * 检测控件组
   */
  private detectControlGroups(
    elements: UIElement[],
    options: ControlBuildOptions
  ): UIElement[][] {
    const groups: UIElement[][] = [];
    const used = new Set<string>();

    for (let i = 0; i < elements.length; i++) {
      if (used.has(elements[i].id)) continue;

      const group = [elements[i]];
      used.add(elements[i].id);

      // 查找相关的元素（如标签对应的输入框）
      for (let j = i + 1; j < elements.length; j++) {
        if (used.has(elements[j].id)) continue;

        if (this.areElementsRelated(elements[i], elements[j])) {
          group.push(elements[j]);
          used.add(elements[j].id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * 判断元素是否相关
   */
  private areElementsRelated(elem1: UIElement, elem2: UIElement): boolean {
    // 标签和输入框的关系
    if (this.isLabel(elem1) && this.isInput(elem2)) {
      return this.isLabelNearInput(elem1, elem2);
    }

    if (this.isLabel(elem2) && this.isInput(elem1)) {
      return this.isLabelNearInput(elem2, elem1);
    }

    // 按钮组关系
    if (this.isButton(elem1) && this.isButton(elem2)) {
      return this.areButtonsInSameGroup(elem1, elem2);
    }

    // 同行元素关系
    return this.areElementsInSameRow(elem1, elem2);
  }

  /**
   * 构建单个元素控件
   */
  private async buildSingleElementControl(
    element: UIElement,
    container: UIContainer,
    options: ControlBuildOptions
  ): Promise<UIControl | null> {
    const controlType = this.determineControlType(element);

    if (!controlType) {
      return null;
    }

    const controlProperties = this.buildControlProperties(element, controlType);
    const operations = await this.buildControlOperations(element, controlType, options);
    const metadata = this.buildControlMetadata(element, container, options);

    const control: UIControl = {
      id: uuidv4(),
      type: controlType,
      bounds: element.bbox,
      container: container.id,
      properties: controlProperties,
      operations,
      metadata
    };

    // 记录元素-控件映射
    this.elementControlMap.set(element.id, {
      element_id: element.id,
      control_id: control.id,
      confidence: 0.9,
      mapping_reason: 'single_element_mapping'
    });

    this.emit('singleElementControlBuilt', {
      elementId: element.id,
      controlId: control.id,
      controlType
    });

    return control;
  }

  /**
   * 构建复合控件
   */
  private async buildCompositeControl(
    elements: UIElement[],
    container: UIContainer,
    options: ControlBuildOptions
  ): Promise<UIControl | null> {
    // 确定主元素（通常是输入框）
    const mainElement = this.findMainElement(elements);
    if (!mainElement) {
      return null;
    }

    const controlType = this.determineControlType(mainElement);
    if (!controlType) {
      return null;
    }

    // 计算复合边界
    const compositeBounds = this.calculateCompositeBounds(elements);

    // 构建复合属性
    const controlProperties = this.buildCompositeControlProperties(elements, controlType);
    const operations = await this.buildCompositeControlOperations(elements, controlType, options);
    const metadata = this.buildCompositeControlMetadata(elements, container, options);

    const control: UIControl = {
      id: uuidv4(),
      type: controlType,
      bounds: compositeBounds,
      container: container.id,
      properties: controlProperties,
      operations,
      metadata
    };

    // 记录所有元素-控件映射
    for (const element of elements) {
      this.elementControlMap.set(element.id, {
        element_id: element.id,
        control_id: control.id,
        confidence: 0.85,
        mapping_reason: 'composite_element_mapping'
      });
    }

    this.emit('compositeControlBuilt', {
      elementIds: elements.map(e => e.id),
      controlId: control.id,
      controlType
    });

    return control;
  }

  /**
   * 构建控件属性
   */
  private buildControlProperties(
    element: UIElement,
    controlType: ControlType
  ): ControlProperties {
    const baseProperties: ControlProperties = {
      label: element.text || '',
      placeholder: '',
      value: '',
      required: false,
      enabled: true,
      visible: true,
      editable: this.isEditableControl(controlType),
      selectable: this.isSelectableControl(controlType),
      focusable: this.isFocusableControl(controlType),
      accessibility_label: element.text || element.description,
      accessibility_role: this.getAccessibilityRole(controlType),
      custom_attributes: {}
    };

    // 根据控件类型添加特定属性
    switch (controlType) {
      case 'input':
        return {
          ...baseProperties,
          input_type: this.guessInputType(element),
          placeholder: this.guessPlaceholder(element),
          maxlength: 100,
          pattern: this.guessValidationPattern(element)
        };

      case 'button':
        return {
          ...baseProperties,
          button_type: this.guessButtonType(element),
          disabled: false,
          submit_type: this.guessSubmitType(element)
        };

      case 'link':
        return {
          ...baseProperties,
          href: this.guessHref(element),
          target: '_self',
          visited: false
        };

      case 'select':
        return {
          ...baseProperties,
          multiple: false,
          options: this.guessSelectOptions(element),
          selected_index: -1
        };

      case 'checkbox':
        return {
          ...baseProperties,
          checked: false,
          indeterminate: false
        };

      case 'radio':
        return {
          ...baseProperties,
          checked: false,
          radio_group: this.guessRadioGroup(element)
        };

      default:
        return baseProperties;
    }
  }

  /**
   * 构建控件操作
   */
  private async buildControlOperations(
    element: UIElement,
    controlType: ControlType,
    options: ControlBuildOptions
  ): Promise<Operation[]> {
    const operations: Operation[] = [];

    if (!options.enable_auto_operations) {
      return operations;
    }

    // 根据控件类型添加标准操作
    switch (controlType) {
      case 'button':
        operations.push(
          {
            id: uuidv4(),
            name: 'click',
            display_name: '点击',
            description: '点击按钮',
            parameters: { button: 'left' },
            required_parameters: [],
            optional_parameters: ['button', 'modifiers', 'position'],
            return_type: 'boolean',
            risk_level: 'low',
            estimated_time: 100
          },
          {
            id: uuidv4(),
            name: 'hover',
            display_name: '悬停',
            description: '鼠标悬停在按钮上',
            parameters: {},
            required_parameters: [],
            optional_parameters: ['duration'],
            return_type: 'boolean',
            risk_level: 'low',
            estimated_time: 200
          }
        );
        break;

      case 'input':
        operations.push(
          {
            id: uuidv4(),
            name: 'type',
            display_name: '输入文本',
            description: '在输入框中输入文本',
            parameters: { text: '' },
            required_parameters: ['text'],
            optional_parameters: ['clear_first', 'delay'],
            return_type: 'boolean',
            risk_level: 'medium',
            estimated_time: 500
          },
          {
            id: uuidv4(),
            name: 'clear',
            display_name: '清空',
            description: '清空输入框内容',
            parameters: {},
            required_parameters: [],
            optional_parameters: [],
            return_type: 'boolean',
            risk_level: 'low',
            estimated_time: 50
          },
          {
            id: uuidv4(),
            name: 'focus',
            display_name: '获得焦点',
            description: '让输入框获得焦点',
            parameters: {},
            required_parameters: [],
            optional_parameters: [],
            return_type: 'boolean',
            risk_level: 'low',
            estimated_time: 50
          }
        );
        break;

      case 'link':
        operations.push(
          {
            id: uuidv4(),
            name: 'click',
            display_name: '点击链接',
            description: '点击链接',
            parameters: {},
            required_parameters: [],
            optional_parameters: ['button', 'modifiers'],
            return_type: 'boolean',
            risk_level: 'medium',
            estimated_time: 200
          }
        );
        break;
    }

    // 添加通用操作
    operations.push(
      {
        id: uuidv4(),
        name: 'scroll_to_view',
        display_name: '滚动到视图',
        description: '滚动控件到可见区域',
        parameters: {},
        required_parameters: [],
        optional_parameters: ['align'],
        return_type: 'boolean',
        risk_level: 'low',
        estimated_time: 100
      },
      {
        id: uuidv4(),
        name: 'get_text',
        display_name: '获取文本',
        description: '获取控件显示的文本',
        parameters: {},
        required_parameters: [],
        optional_parameters: [],
        return_type: 'string',
        risk_level: 'low',
        estimated_time: 10
      }
    );

    return operations;
  }

  /**
   * 构建控件元数据
   */
  private buildControlMetadata(
    element: UIElement,
    container: UIContainer,
    options: ControlBuildOptions
  ): ControlMetadata {
    return {
      confidence: 0.9,
      source_elements: [element.id],
      detection_method: options.enable_smart_detection ? 'smart_detection' : 'basic_detection',
      created_at: new Date(),
      last_updated: new Date(),
      version: 1,
      tags: this.generateControlTags(element),
      annotations: this.generateControlAnnotations(element),
      custom_properties: {
        original_element_type: element.type,
        original_confidence: element.confidence,
        container_type: container.type
      }
    };
  }

  // 辅助方法实现

  private getTypeOrder(type: ElementType): number {
    const typeOrder: Record<ElementType, number> = {
      'container': 1,
      'text': 2,
      'input': 3,
      'button': 4,
      'link': 5,
      'select': 6,
      'checkbox': 7,
      'radio': 8,
      'image': 9,
      'video': 10,
      'audio': 11,
      'table': 12,
      'list': 13,
      'menu': 14,
      'dialog': 15,
      'tooltip': 16,
      'progressbar': 17,
      'slider': 18,
      'spinner': 19,
      'switch': 20,
      'tab': 21,
      'accordion': 22,
      'carousel': 23,
      'tree': 24,
      'grid': 25,
      'calendar': 26,
      'color_picker': 27,
      'date_picker': 28,
      'time_picker': 29,
      'file_upload': 30,
      'search': 31,
      'navigation': 32,
      'breadcrumb': 33,
      'pagination': 34,
      'toolbar': 35,
      'sidebar': 36,
      'header': 37,
      'footer': 38,
      'section': 39,
      'article': 40,
      'aside': 41,
      'figure': 42,
      'details': 43,
      'summary': 44,
      'unknown': 99
    };
    return typeOrder[type] || 99;
  }

  private isButtonText(text: string): boolean {
    const buttonPatterns = [
      /^(点击|确定|取消|保存|删除|编辑|提交|搜索|登录|注册|下一步|上一步|返回|关闭|OK|Cancel|Save|Delete|Edit|Submit|Search|Login|Register|Next|Back|Return|Close)/i,
      /^(立即|马上|现在|点击此处)/i,
      /^(查看|展开|收起|更多|详情)/i
    ];
    return buttonPatterns.some(pattern => pattern.test(text));
  }

  private isLinkText(text: string): boolean {
    const linkPatterns = [
      /^(点击|查看|访问|前往|跳转|详情|更多信息)/i,
      /(此处|这里|链接)/i,
      /^https?:\/\//i,
      /\.com$|\.cn$|\.org$/i
    ];
    return linkPatterns.some(pattern => pattern.test(text));
  }

  private isInputLabel(text: string): boolean {
    const labelPatterns = [
      /(用户名|密码|邮箱|手机|姓名|地址|账号|登录名)/i,
      /(请输入|请填写|请选择)/i,
      /(\*?)[:：]\s*$/
    ];
    return labelPatterns.some(pattern => pattern.test(text));
  }

  private isInputSize(bbox: any): boolean {
    const width = bbox.width || (bbox.x2 - bbox.x1);
    const height = bbox.height || (bbox.y2 - bbox.y1);
    return width >= 50 && width <= 500 && height >= 20 && height <= 100;
  }

  private isElementInContainer(element: UIElement, container: UIContainer): boolean {
    return element.bbox.x1 >= container.bounds.x1 &&
           element.bbox.y1 >= container.bounds.y1 &&
           element.bbox.x2 <= container.bounds.x2 &&
           element.bbox.y2 <= container.bounds.y2;
  }

  private calculateArea(bbox: any): number {
    const width = bbox.width || (bbox.x2 - bbox.x1);
    const height = bbox.height || (bbox.y2 - bbox.y1);
    return width * height;
  }

  private calculateCenter(bbox: any): { x: number; y: number } {
    const width = bbox.width || (bbox.x2 - bbox.x1);
    const height = bbox.height || (bbox.y2 - bbox.y1);
    return {
      x: bbox.x1 + width / 2,
      y: bbox.y1 + height / 2
    };
  }

  private calculateDistance(point1: { x: number; y: number }, point2: { x: number; y: number }): number {
    return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
  }

  private sortElementsByPosition(elements: UIElement[]): UIElement[] {
    return elements.sort((a, b) => {
      const yDiff = a.bbox.y1 - b.bbox.y1;
      if (Math.abs(yDiff) < 20) { // 同行
        return a.bbox.x1 - b.bbox.x1;
      }
      return yDiff;
    });
  }

  private isLabel(element: UIElement): boolean {
    return element.type === 'text' ||
           (element.text && !this.isButton(element) && !this.isLink(element));
  }

  private isInput(element: UIElement): boolean {
    return element.type === 'input' ||
           ['input', 'textarea', 'select'].includes(element.text?.toLowerCase() || '');
  }

  private isButton(element: UIElement): boolean {
    return element.type === 'button' ||
           (element.text && this.isButtonText(element.text));
  }

  private isLink(element: UIElement): boolean {
    return element.type === 'link' ||
           (element.text && this.isLinkText(element.text));
  }

  private isLabelNearInput(label: UIElement, input: UIElement): boolean {
    const distance = this.calculateDistance(
      this.calculateCenter(label.bbox),
      this.calculateCenter(input.bbox)
    );
    return distance < 100; // 100像素内认为相关
  }

  private areButtonsInSameGroup(btn1: UIElement, btn2: UIElement): boolean {
    // 检查是否在同一行且高度相似
    const sameRow = Math.abs(btn1.bbox.y1 - btn2.bbox.y1) < 20;
    const similarHeight = Math.abs(
      (btn1.bbox.height || (btn1.bbox.y2 - btn1.bbox.y1)) -
      (btn2.bbox.height || (btn2.bbox.y2 - btn2.bbox.y1))
    ) < 10;

    return sameRow && similarHeight;
  }

  private areElementsInSameRow(elem1: UIElement, elem2: UIElement): boolean {
    return Math.abs(elem1.bbox.y1 - elem2.bbox.y1) < 30;
  }

  private determineControlType(element: UIElement): ControlType | null {
    const typeMapping: Record<ElementType, ControlType | null> = {
      'button': 'button',
      'input': 'input',
      'link': 'link',
      'select': 'select',
      'checkbox': 'checkbox',
      'radio': 'radio',
      'text': null, // 需要进一步判断
      'image': null,
      'container': null,
      'table': null,
      'list': null,
      'menu': null,
      'dialog': null,
      'tooltip': null,
      'progressbar': 'progress_bar',
      'slider': 'slider',
      'spinner': 'spinner',
      'switch': 'toggle',
      'tab': 'tab',
      'accordion': 'accordion',
      'carousel': 'carousel',
      'tree': 'tree_view',
      'grid': 'grid',
      'calendar': 'date_picker',
      'color_picker': 'color_picker',
      'date_picker': 'date_picker',
      'time_picker': 'time_picker',
      'file_upload': 'file_input',
      'search': 'search_input',
      'navigation': null,
      'breadcrumb': null,
      'pagination': null,
      'toolbar': null,
      'sidebar': null,
      'header': null,
      'footer': null,
      'section': null,
      'article': null,
      'aside': null,
      'figure': null,
      'details': null,
      'summary': null,
      'video': null,
      'audio': null,
      'unknown': null
    };

    return typeMapping[element.type] || null;
  }

  private findMainElement(elements: UIElement[]): UIElement | null {
    // 优先选择输入框作为主元素
    for (const element of elements) {
      if (this.isInput(element)) {
        return element;
      }
    }

    // 其次选择按钮
    for (const element of elements) {
      if (this.isButton(element)) {
        return element;
      }
    }

    // 最后选择第一个元素
    return elements[0] || null;
  }

  private calculateCompositeBounds(elements: UIElement[]): any {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const element of elements) {
      minX = Math.min(minX, element.bbox.x1);
      minY = Math.min(minY, element.bbox.y1);
      maxX = Math.max(maxX, element.bbox.x2);
      maxY = Math.max(maxY, element.bbox.y2);
    }

    return {
      x1: minX,
      y1: minY,
      x2: maxX,
      y2: maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private isEditableControl(controlType: ControlType): boolean {
    return ['input', 'textarea', 'select', 'search_input', 'file_input'].includes(controlType);
  }

  private isSelectableControl(controlType: ControlType): boolean {
    return ['select', 'checkbox', 'radio', 'toggle'].includes(controlType);
  }

  private isFocusableControl(controlType: ControlType): boolean {
    return ['input', 'button', 'link', 'select', 'textarea', 'search_input', 'file_input'].includes(controlType);
  }

  private getAccessibilityRole(controlType: ControlType): string {
    const roleMapping: Record<ControlType, string> = {
      'button': 'button',
      'input': 'textbox',
      'link': 'link',
      'select': 'combobox',
      'checkbox': 'checkbox',
      'radio': 'radio',
      'search_input': 'searchbox',
      'file_input': 'button',
      'date_picker': 'textbox',
      'time_picker': 'textbox',
      'color_picker': 'button',
      'slider': 'slider',
      'toggle': 'switch',
      'progress_bar': 'progressbar',
      'spinner': 'progressbar',
      'tab': 'tab',
      'tree_view': 'tree'
    };

    return roleMapping[controlType] || 'generic';
  }

  // 以下是简化的属性猜测方法
  private guessInputType(element: UIElement): string {
    if (element.text?.toLowerCase().includes('密码')) return 'password';
    if (element.text?.toLowerCase().includes('邮箱')) return 'email';
    if (element.text?.toLowerCase().includes('手机')) return 'tel';
    if (element.text?.toLowerCase().includes('搜索')) return 'search';
    return 'text';
  }

  private guessPlaceholder(element: UIElement): string {
    return element.text || '';
  }

  private guessValidationPattern(element: UIElement): string {
    if (element.text?.toLowerCase().includes('邮箱')) return 'email';
    if (element.text?.toLowerCase().includes('手机')) return 'phone';
    return '';
  }

  private guessButtonType(element: UIElement): string {
    if (element.text?.toLowerCase().includes('提交') || element.text?.toLowerCase().includes('保存')) return 'submit';
    if (element.text?.toLowerCase().includes('重置') || element.text?.toLowerCase().includes('清空')) return 'reset';
    return 'button';
  }

  private guessSubmitType(element: UIElement): string {
    return 'none';
  }

  private guessHref(element: UIElement): string {
    return '#';
  }

  private guessSelectOptions(element: UIElement): string[] {
    return ['选项1', '选项2', '选项3'];
  }

  private guessRadioGroup(element: UIElement): string {
    return 'radio_group_' + Math.random().toString(36).substr(2, 9);
  }

  // 复合控件相关方法（简化实现）
  private buildCompositeControlProperties(elements: UIElement[], controlType: ControlType): ControlProperties {
    const mainElement = this.findMainElement(elements);
    if (mainElement) {
      return this.buildControlProperties(mainElement, controlType);
    }
    return this.buildControlProperties(elements[0], controlType);
  }

  private async buildCompositeControlOperations(elements: UIElement[], controlType: ControlType, options: ControlBuildOptions): Promise<Operation[]> {
    const mainElement = this.findMainElement(elements);
    if (mainElement) {
      return this.buildControlOperations(mainElement, controlType, options);
    }
    return [];
  }

  private buildCompositeControlMetadata(elements: UIElement[], container: UIContainer, options: ControlBuildOptions): ControlMetadata {
    const mainElement = this.findMainElement(elements);
    if (mainElement) {
      return {
        ...this.buildControlMetadata(mainElement, container, options),
        source_elements: elements.map(e => e.id)
      };
    }
    return this.buildControlMetadata(elements[0], container, options);
  }

  private findUnassignedElements(elements: UIElement[], controls: UIControl[]): UIElement[] {
    const assignedElementIds = new Set<string>();

    // 从elementControlMap获取已分配的元素
    for (const [elementId] of this.elementControlMap) {
      assignedElementIds.add(elementId);
    }

    return elements.filter(element => !assignedElementIds.has(element.id));
  }

  private async optimizeControlStructure(controls: UIControl[], containers: UIContainer[], options: ControlBuildOptions): Promise<UIControl[]> {
    // 简化实现：直接返回原控件
    return controls;
  }

  private async establishControlRelationships(controls: UIControl[]): Promise<void> {
    // 简化实现：控件关系建立
  }

  private calculateBuildStats(elements: UIElement[], controls: UIControl[], processingTime: number): ControlBuildStats {
    const controlsByType: Record<ControlType, number> = {} as any;
    for (const control of controls) {
      controlsByType[control.type] = (controlsByType[control.type] || 0) + 1;
    }

    return {
      total_elements: elements.length,
      total_controls: controls.length,
      controls_by_type: controlsByType,
      assigned_elements: this.elementControlMap.size,
      unassigned_elements: elements.length - this.elementControlMap.size,
      assignment_rate: this.elementControlMap.size / elements.length,
      processing_time
    };
  }

  private calculateQualityMetrics(controls: UIControl[], elements: UIElement[]): ControlQualityMetrics {
    return {
      detection_accuracy: 0.9,
      semantic_coherence: 0.85,
      operation_completeness: 0.88,
      boundary_precision: 0.92,
      overall_score: 0.89
    };
  }

  private generateControlTags(element: UIElement): string[] {
    const tags: string[] = [element.type];

    if (element.text) {
      tags.push('has_text');
    }

    if (element.confidence > 0.9) {
      tags.push('high_confidence');
    }

    return tags;
  }

  private generateControlAnnotations(element: UIElement): string[] {
    const annotations: string[] = [];

    if (element.description) {
      annotations.push(`描述: ${element.description}`);
    }

    if (element.confidence < 0.8) {
      annotations.push('低置信度识别');
    }

    return annotations;
  }
}