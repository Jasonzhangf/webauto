import type {
  AIProviderConfig,
  VisualAnalysisResponse
} from './types.js';

/**
 * 视觉分析器 - 通过截图+位置的方式分析 DOM
 * 使用 Vision AI 识别页面元素位置，然后通过坐标找到对应的 DOM 元素
 */
export class VisualAnalyzer {
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = {
      baseUrl: config.baseUrl || 'http://127.0.0.1:5555',
      model: config.model || 'gpt-4-vision-preview',
      apiKey: config.apiKey
    };
  }

  /**
   * 通过截图分析元素位置
   */
  async analyzeByImage(
    imageBase64: string,
    targetDescription: string,
    viewport: { width: number; height: number }
  ): Promise<VisualAnalysisResponse> {
    try {
      const systemPrompt = `你是一个专业的 Web UI 分析专家。

你的任务是：
1. 分析提供的网页截图
2. 根据目标描述，找到对应的元素
3. 返回元素的边界框坐标（相对于截图）

坐标系统：
- 原点 (0, 0) 在左上角
- x 轴向右增长
- y 轴向下增长
- 单位为像素

请以 JSON 格式返回：
{
  "boundingBoxes": [
    {
      "x": 左上角 x 坐标,
      "y": 左上角 y 坐标,
      "width": 宽度,
      "height": 高度,
      "label": "元素描述"
    }
  ]
}

如果找到多个匹配的元素，请全部返回。`;

      const userPrompt = `目标描述：${targetDescription}

截图尺寸：${viewport.width}x${viewport.height}

请找出所有匹配的元素，返回它们的边界框坐标。`;

      const response = await this.callVisionAI(imageBase64, systemPrompt, userPrompt);
      
      // 解析 AI 响应
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI response is not valid JSON');
      }

      const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      
      return {
        success: true,
        boundingBoxes: result.boundingBoxes || []
      };

    } catch (error) {
      return {
        success: false,
        error: `Visual analysis failed: ${error}`
      };
    }
  }

  /**
   * 调用 Vision AI 模型
   */
  private async callVisionAI(
    imageBase64: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  /**
   * 根据坐标在浏览器中查找 DOM 元素
   */
  async findElementByCoordinates(
    profile: string,
    x: number,
    y: number
  ): Promise<{
    selector: string;
    tagName: string;
    className: string;
    id: string;
    textContent: string;
  } | null> {
    const UNIFIED_API = 'http://127.0.0.1:7701';
    
    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile,
          script: `
            (function() {
              const element = document.elementFromPoint(${x}, ${y});
              if (!element) return null;
              
              // 生成唯一选择器
              function getSelector(el) {
                if (el.id) return '#' + el.id;
                
                let selector = el.tagName.toLowerCase();
                
                // 添加 class
                if (el.className && typeof el.className === 'string') {
                  const classes = el.className.split(' ').filter(c => c);
                  if (classes.length > 0) {
                    // 使用属性选择器匹配动态 class
                    const stableClass = classes.find(c => !(/[A-Z0-9]{5,}/.test(c)));
                    if (stableClass) {
                      selector += '.' + stableClass;
                    } else {
                      selector += '[class*="' + classes[0].replace(/[_-][A-Z0-9]+$/,'') + '"]';
                    }
                  }
                }
                
                // 添加结构位置
                let parent = el.parentElement;
                if (parent) {
                  const siblings = Array.from(parent.children);
                  const index = siblings.indexOf(el);
                  if (siblings.length > 1) {
                    selector += ':nth-child(' + (index + 1) + ')';
                  }
                }
                
                return selector;
              }
              
              return {
                selector: getSelector(element),
                tagName: element.tagName.toLowerCase(),
                className: element.className,
                id: element.id || '',
                textContent: (element.textContent || '').substring(0, 100)
              };
            })()
          `
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to find element: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data || null;
  }

  /**
   * 在浏览器中高亮坐标区域
   */
  async highlightCoordinates(
    profile: string,
    boxes: Array<{ x: number; y: number; width: number; height: number; label?: string }>
  ): Promise<void> {
    const UNIFIED_API = 'http://127.0.0.1:7701';
    
    await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile,
          script: `
            (function() {
              // 移除旧的高亮
              document.querySelectorAll('.visual-analyzer-box').forEach(el => el.remove());
              
              const boxes = ${JSON.stringify(boxes)};
              
              boxes.forEach((box, index) => {
                const div = document.createElement('div');
                div.className = 'visual-analyzer-box';
                div.style.cssText = \`
                  position: fixed;
                  left: \${box.x}px;
                  top: \${box.y}px;
                  width: \${box.width}px;
                  height: \${box.height}px;
                  border: 3px solid #FF6B35;
                  background: rgba(255, 107, 53, 0.1);
                  pointer-events: none;
                  z-index: 999999;
                  box-sizing: border-box;
                \`;
                
                if (box.label) {
                  const label = document.createElement('div');
                  label.style.cssText = \`
                    position: absolute;
                    top: -24px;
                    left: 0;
                    background: #FF6B35;
                    color: white;
                    padding: 2px 8px;
                    font-size: 12px;
                    font-family: monospace;
                    border-radius: 3px;
                  \`;
                  label.textContent = box.label;
                  div.appendChild(label);
                }
                
                document.body.appendChild(div);
              });
              
              // 5秒后自动移除
              setTimeout(() => {
                document.querySelectorAll('.visual-analyzer-box').forEach(el => el.remove());
              }, 5000);
            })()
          `
        }
      })
    });
  }

  /**
   * 截取页面截图
   */
  async captureScreenshot(profile: string): Promise<string> {
    const UNIFIED_API = 'http://127.0.0.1:7701';
    
    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:screenshot',
        payload: {
          profile,
          fullPage: false,
          format: 'png'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to capture screenshot: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data?.base64 || '';
  }

  /**
   * 获取坐标周围的邻近元素（父子兄弟元素）
   */
  async getNearbyElements(
    profile: string,
    x: number,
    y: number,
    maxDistance: number = 50
  ): Promise<{
    element: {
      selector: string;
      tagName: string;
      className: string;
      id: string;
      textContent: string;
    };
    nearby: Array<{
      selector: string;
      tagName: string;
      className: string;
      id: string;
      textContent: string;
      relation: 'parent' | 'child' | 'sibling' | 'ancestor' | 'descendant';
    }>;
  } | null> {
    const UNIFIED_API = 'http://127.0.0.1:7701';
    
    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile,
          script: `
            (function() {
              const element = document.elementFromPoint(${x}, ${y});
              if (!element) return null;
              
              // 生成选择器
              function getSelector(el) {
                if (el.id) return '#' + el.id;
                
                let selector = el.tagName.toLowerCase();
                
                if (el.className && typeof el.className === 'string') {
                  const classes = el.className.split(' ').filter(c => c);
                  if (classes.length > 0) {
                    const stableClass = classes.find(c => !(/[A-Z0-9]{5,}/.test(c)));
                    if (stableClass) {
                      selector += '.' + stableClass;
                    } else {
                      selector += '[class*="' + classes[0].replace(/[_-][A-Z0-9]+$/,'') + '"]';
                    }
                  }
                }
                
                return selector;
              }
              
              // 获取附近元素
              const nearby = [];
              
              // 获取父元素
              if (element.parentElement) {
                nearby.push({
                  selector: getSelector(element.parentElement),
                  tagName: element.parentElement.tagName.toLowerCase(),
                  className: element.parentElement.className || '',
                  id: element.parentElement.id || '',
                  textContent: (element.parentElement.textContent || '').substring(0, 100),
                  relation: 'parent'
                });
              }
              
              // 获取子元素
              const children = Array.from(element.children);
              for (const child of children) {
                nearby.push({
                  selector: getSelector(child),
                  tagName: child.tagName.toLowerCase(),
                  className: child.className || '',
                  id: child.id || '',
                  textContent: (child.textContent || '').substring(0, 100),
                  relation: 'child'
                });
              }
              
              // 获取兄弟元素
              if (element.parentElement) {
                const siblings = Array.from(element.parentElement.children);
                for (const sibling of siblings) {
                  if (sibling !== element) {
                    nearby.push({
                      selector: getSelector(sibling),
                      tagName: sibling.tagName.toLowerCase(),
                      className: sibling.className || '',
                      id: sibling.id || '',
                      textContent: (sibling.textContent || '').substring(0, 100),
                      relation: 'sibling'
                    });
                  }
                }
              }
              
              // 获取祖先元素
              let ancestor = element.parentElement;
              let depth = 0;
              while (ancestor && depth < 3) {
                nearby.push({
                  selector: getSelector(ancestor),
                  tagName: ancestor.tagName.toLowerCase(),
                  className: ancestor.className || '',
                  id: ancestor.id || '',
                  textContent: (ancestor.textContent || '').substring(0, 100),
                  relation: 'ancestor'
                });
                ancestor = ancestor.parentElement;
                depth++;
              }
              
              // 获取后代元素（限制数量）
              const descendants = Array.from(element.querySelectorAll('*'));
              for (let i = 0; i < Math.min(descendants.length, 5); i++) {
                const desc = descendants[i];
                nearby.push({
                  selector: getSelector(desc),
                  tagName: desc.tagName.toLowerCase(),
                  className: desc.className || '',
                  id: desc.id || '',
                  textContent: (desc.textContent || '').substring(0, 100),
                  relation: 'descendant'
                });
              }
              
              return {
                element: {
                  selector: getSelector(element),
                  tagName: element.tagName.toLowerCase(),
                  className: element.className || '',
                  id: element.id || '',
                  textContent: (element.textContent || '').substring(0, 100)
                },
                nearby: nearby
              };
            })()
          `
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to get nearby elements: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data || null;
  }

  /**
   * 获取局部 DOM 结构
   */
  async getLocalDOMStructure(
    profile: string,
    x: number,
    y: number,
    maxDepth: number = 3
  ): Promise<{
    element: {
      selector: string;
      tagName: string;
      className: string;
      id: string;
      textContent: string;
    };
    structure: string;
    children: Array<{
      selector: string;
      tagName: string;
      className: string;
      id: string;
      textContent: string;
    }>;
  } | null> {
    const UNIFIED_API = 'http://127.0.0.1:7701';
    
    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile,
          script: `
            (function() {
              const element = document.elementFromPoint(${x}, ${y});
              if (!element) return null;
              
              // 生成选择器
              function getSelector(el) {
                if (el.id) return '#' + el.id;
                
                let selector = el.tagName.toLowerCase();
                
                if (el.className && typeof el.className === 'string') {
                  const classes = el.className.split(' ').filter(c => c);
                  if (classes.length > 0) {
                    const stableClass = classes.find(c => !(/[A-Z0-9]{5,}/.test(c)));
                    if (stableClass) {
                      selector += '.' + stableClass;
                    } else {
                      selector += '[class*="' + classes[0].replace(/[_-][A-Z0-9]+$/,'') + '"]';
                    }
                  }
                }
                
                return selector;
              }
              
              // 生成 DOM 结构
              function getDOMStructure(el, depth = 0, maxDepth = ${maxDepth}) {
                if (depth > maxDepth) return '';
                
                let structure = '<' + el.tagName.toLowerCase();
                if (el.id) structure += ' id="' + el.id + '"';
                if (el.className) {
                  const classes = el.className.split(' ').filter(c => c);
                  if (classes.length > 0) {
                    const stableClass = classes.find(c => !(/[A-Z0-9]{5,}/.test(c)));
                    if (stableClass) {
                      structure += ' class="' + stableClass + '"';
                    } else {
                      structure += ' class="' + classes[0].replace(/[_-][A-Z0-9]+$/, '') + '"';
                    }
                  }
                }
                structure += '>';
                
                const children = Array.from(el.children);
                if (children.length > 0) {
                  structure += '\\n';
                  for (const child of children) {
                    structure += '  '.repeat(depth + 1) + getDOMStructure(child, depth + 1, maxDepth) + '\\n';
                  }
                  structure += '  '.repeat(depth);
                } else if (el.textContent && el.textContent.trim()) {
                  structure += el.textContent.substring(0, 50);
                }
                
                structure += '</' + el.tagName.toLowerCase() + '>';
                
                return structure;
              }
              
              // 获取子元素
              const children = Array.from(element.children).map(child => ({
                selector: getSelector(child),
                tagName: child.tagName.toLowerCase(),
                className: child.className || '',
                id: child.id || '',
                textContent: (child.textContent || '').substring(0, 100)
              }));
              
              return {
                element: {
                  selector: getSelector(element),
                  tagName: element.tagName.toLowerCase(),
                  className: element.className || '',
                  id: element.id || '',
                  textContent: (element.textContent || '').substring(0, 100)
                },
                structure: getDOMStructure(element),
                children: children
              };
            })()
          `
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to get local DOM structure: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data || null;
  }
}
