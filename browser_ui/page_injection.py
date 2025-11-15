"""
页面注入系统
在网页中注入控制和交互功能
"""

class PageInjector:
    """页面注入器"""
    
    def __init__(self, browser_controller):
        self.controller = browser_controller
        self.injection_script = self._get_injection_script()
    
    def inject_ui(self, page) -> str:
        """在页面中注入UI控制界面"""
        try:
            # 注入CSS和HTML
            page.evaluate(self.injection_script)
            return "UI注入成功"
        except Exception as e:
            return f"UI注入失败: {e}"
    
    def _get_injection_script(self) -> str:
        """获取注入脚本"""
        return '''
        // WebAuto 控制界面注入
        (function() {
            // 检查是否已经注入
            if (document.getElementById('webauto-control-panel')) {
                return;
            }
            
            // 创建CSS样式
            const style = document.createElement('style');
            style.textContent = `
                #webauto-control-panel {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    width: 300px;
                    background: rgba(30, 30, 30, 0.95);
                    border: 2px solid #4CAF50;
                    border-radius: 8px;
                    color: white;
                    font-family: Arial, sans-serif;
                    z-index: 10000;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    backdrop-filter: blur(10px);
                }
                
                #webauto-control-panel.minimized {
                    width: 50px;
                    height: 50px;
                    overflow: hidden;
                }
                
                .webauto-header {
                    background: #4CAF50;
                    padding: 10px;
                    cursor: move;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .webauto-content {
                    padding: 15px;
                    max-height: 400px;
                    overflow-y: auto;
                }
                
                .webauto-section {
                    margin-bottom: 15px;
                    border-bottom: 1px solid #444;
                    padding-bottom: 10px;
                }
                
                .webauto-btn {
                    background: #2196F3;
                    color: white;
                    border: none;
                    padding: 8px 12px;
                    margin: 3px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    display: inline-block;
                }
                
                .webauto-btn:hover {
                    background: #1976D2;
                }
                
                .webauto-input {
                    width: 100%;
                    padding: 8px;
                    margin: 5px 0;
                    border: 1px solid #555;
                    background: #333;
                    color: white;
                    border-radius: 4px;
                    box-sizing: border-box;
                }
                
                .webauto-log {
                    background: #222;
                    padding: 10px;
                    border-radius: 4px;
                    height: 100px;
                    overflow-y: auto;
                    font-family: monospace;
                    font-size: 11px;
                }
                
                .webauto-minimize-btn {
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 16px;
                }
                
                .element-highlight {
                    background: rgba(76, 175, 80, 0.3) !important;
                    border: 2px solid #4CAF50 !important;
                }
            `;
            document.head.appendChild(style);
            
            // 创建控制面板HTML
            const panel = document.createElement('div');
            panel.id = 'webauto-control-panel';
            panel.innerHTML = `
                <div class="webauto-header">
                    <span>🌐 WebAuto Control</span>
                    <button class="webauto-minimize-btn" onclick="togglePanel()">_</button>
                </div>
                <div class="webauto-content">
                    <div class="webauto-section">
                        <h4>页面信息</h4>
                        <div>URL: <span id="page-url">${window.location.href}</span></div>
                        <div>标题: <span id="page-title">${document.title}</span></div>
                    </div>
                    
                    <div class="webauto-section">
                        <h4>快速操作</h4>
                        <button class="webauto-btn" onclick="scrollToTop()">⬆️ 回到顶部</button>
                        <button class="webauto-btn" onclick="scrollToBottom()">⬇️ 回到底部</button>
                        <button class="webauto-btn" onclick="highlightElements()">🎯 高亮元素</button>
                        <button class="webauto-btn" onclick="removeHighlights()">🧹 清除高亮</button>
                    </div>
                    
                    <div class="webauto-section">
                        <h4>元素选择器</h4>
                        <input type="text" class="webauto-input" id="element-selector" 
                               placeholder="输入CSS选择器...">
                        <button class="webauto-btn" onclick="selectElement()">🔍 选择元素</button>
                        <button class="webauto-btn" onclick="clickElement()">👆 点击元素</button>
                        <button class="webauto-btn" onclick="getElementInfo()">ℹ️ 元素信息</button>
                    </div>
                    
                    <div class="webauto-section">
                        <h4>脚本执行</h4>
                        <textarea class="webauto-input" id="script-input" rows="3" 
                                  placeholder="输入JavaScript代码..."></textarea>
                        <button class="webauto-btn" onclick="executeScript()">▶️ 执行脚本</button>
                    </div>
                    
                    <div class="webauto-section">
                        <h4>操作日志</h4>
                        <div class="webauto-log" id="operation-log"></div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            // 添加JavaScript函数
            window.WebAutoControl = {
                log: function(message) {
                    const logDiv = document.getElementById('operation-log');
                    const time = new Date().toLocaleTimeString();
                    logDiv.innerHTML += `[${time}] ${message}<br>`;
                    logDiv.scrollTop = logDiv.scrollHeight;
                },
                
                togglePanel: function() {
                    const panel = document.getElementById('webauto-control-panel');
                    panel.classList.toggle('minimized');
                },
                
                scrollToTop: function() {
                    window.scrollTo({top: 0, behavior: 'smooth'});
                    this.log('滚动到页面顶部');
                },
                
                scrollToBottom: function() {
                    window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});
                    this.log('滚动到页面底部');
                },
                
                highlightElements: function() {
                    const selector = document.getElementById('element-selector').value;
                    if (!selector) {
                        this.log('请输入选择器');
                        return;
                    }
                    
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => el.classList.add('element-highlight'));
                    this.log(`高亮了 ${elements.length} 个元素`);
                },
                
                removeHighlights: function() {
                    const highlighted = document.querySelectorAll('.element-highlight');
                    highlighted.forEach(el => el.classList.remove('element-highlight'));
                    this.log('清除了所有高亮');
                },
                
                selectElement: function() {
                    const selector = document.getElementById('element-selector').value;
                    if (!selector) {
                        this.log('请输入选择器');
                        return;
                    }
                    
                    const elements = document.querySelectorAll(selector);
                    if (elements.length === 0) {
                        this.log('未找到元素');
                        return;
                    }
                    
                    elements[0].scrollIntoView({behavior: 'smooth', block: 'center'});
                    this.highlightElements();
                    this.log(`选中了 ${elements.length} 个元素`);
                },
                
                clickElement: function() {
                    const selector = document.getElementById('element-selector').value;
                    if (!selector) {
                        this.log('请输入选择器');
                        return;
                    }
                    
                    const elements = document.querySelectorAll(selector);
                    if (elements.length === 0) {
                        this.log('未找到元素');
                        return;
                    }
                    
                    elements[0].click();
                    this.log(`点击了元素: ${selector}`);
                },
                
                getElementInfo: function() {
                    const selector = document.getElementById('element-selector').value;
                    if (!selector) {
                        this.log('请输入选择器');
                        return;
                    }
                    
                    const elements = document.querySelectorAll(selector);
                    if (elements.length === 0) {
                        this.log('未找到元素');
                        return;
                    }
                    
                    const element = elements[0];
                    const info = {
                        tagName: element.tagName,
                        text: element.textContent?.substring(0, 100),
                        className: element.className,
                        id: element.id,
                        rect: element.getBoundingClientRect()
                    };
                    
                    this.log(`元素信息: ${JSON.stringify(info, null, 2)}`);
                },
                
                executeScript: function() {
                    const script = document.getElementById('script-input').value;
                    if (!script) {
                        this.log('请输入脚本');
                        return;
                    }
                    
                    try {
                        const result = eval(script);
                        this.log(`脚本执行成功: ${typeof result === 'object' ? JSON.stringify(result) : result}`);
                    } catch (error) {
                        this.log(`脚本执行失败: ${error.message}`);
                    }
                }
            };
            
            // 绑定全局函数
            window.togglePanel = window.WebAutoControl.togglePanel;
            window.scrollToTop = window.WebAutoControl.scrollToTop;
            window.scrollToBottom = window.WebAutoControl.scrollToBottom;
            window.highlightElements = window.WebAutoControl.highlightElements;
            window.removeHighlights = window.WebAutoControl.removeHighlights;
            window.selectElement = window.WebAutoControl.selectElement;
            window.clickElement = window.WebAutoControl.clickElement;
            window.getElementInfo = window.WebAutoControl.getElementInfo;
            window.executeScript = window.WebAutoControl.executeScript;
            
            // 使面板可拖动
            let isDragging = false;
            let dragStartX, dragStartY, initialX, initialY;
            
            const header = panel.querySelector('.webauto-header');
            
            header.addEventListener('mousedown', (e) => {
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                initialX = panel.offsetLeft;
                initialY = panel.offsetTop;
                
                e.preventDefault();
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const dx = e.clientX - dragStartX;
                const dy = e.clientY - dragStartY;
                
                panel.style.left = (initialX + dx) + 'px';
                panel.style.top = (initialY + dy) + 'px';
                panel.style.right = 'auto';
            });
            
            document.addEventListener('mouseup', () => {
                isDragging = false;
            });
            
            // 初始化日志
            window.WebAutoControl.log('WebAuto 控制面板已加载');
            
        })();
        '''
    
    def setup_element_picker(self, page):
        """设置元素选择器"""
        picker_script = '''
        // 元素选择器功能
        document.addEventListener('mouseover', function(e) {
            if (e.target.closest('#webauto-control-panel')) return;
            
            e.target.style.outline = '2px solid #4CAF50';
            e.target.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
        });
        
        document.addEventListener('mouseout', function(e) {
            if (e.target.closest('#webauto-control-panel')) return;
            
            e.target.style.outline = '';
            e.target.style.backgroundColor = '';
        });
        
        document.addEventListener('click', function(e) {
            if (e.target.closest('#webauto-control-panel')) return;
            
            const selector = generateSelector(e.target);
            document.getElementById('element-selector').value = selector;
            window.WebAutoControl.log(`选择器: ${selector}`);
            
            e.preventDefault();
            e.stopPropagation();
        });
        
        function generateSelector(element) {
            if (element.id) {
                return `#${element.id}`;
            }
            
            const path = [];
            let current = element;
            
            while (current && current.nodeType === Node.ELEMENT_NODE) {
                let selector = current.nodeName.toLowerCase();
                
                if (current.className) {
                    selector += '.' + current.className.split(' ').join('.');
                }
                
                path.unshift(selector);
                current = current.parentNode;
            }
            
            return path.join(' > ');
        }
        '''
        
        try:
            page.evaluate(picker_script)
            return "元素选择器设置成功"
        except Exception as e:
            return f"元素选择器设置失败: {e}"
