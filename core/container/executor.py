"""
容器操作执行器 - 执行容器定义中的operations队列
"""

import asyncio
import time
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass

from .models_v2 import (
    ContainerDefV2, ContainerExecutionContext, ContainerExecutionResult,
    OperationType, OperationConfig, SelectorByClass
)
from ..anti_detection.engine import AntiDetectionEngine


@dataclass
class OperationResult:
    """单个操作执行结果"""
    operation: OperationConfig
    success: bool
    duration: float
    result_data: Any = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'operation': self.operation.to_dict(),
            'success': self.success,
            'duration': self.duration,
            'result_data': self.result_data,
            'error_message': self.error_message,
            'metadata': self.metadata
        }


class ContainerOperationExecutor:
    """容器操作执行器"""

    def __init__(self, anti_detection_engine: Optional[AntiDetectionEngine] = None):
        self.anti_detection_engine = anti_detection_engine
        self.execution_history: List[ContainerExecutionResult] = []

    async def execute_container(
        self,
        container: ContainerDefV2,
        context: ContainerExecutionContext
    ) -> ContainerExecutionResult:
        """执行容器的所有操作"""
        start_time = time.time()
        operation_results = []
        errors = []

        try:
            # 验证容器选择器
            element_handle = await self._find_container_element(container, context)
            if not element_handle:
                raise ValueError(f"无法找到容器元素: {container.get_primary_selector()}")

            # 执行操作队列
            for i, operation in enumerate(container.operations):
                try:
                    result = await self._execute_single_operation(
                        operation, element_handle, context, i
                    )
                    operation_results.append(result.to_dict())

                    if not result.success and operation.type != OperationType.WAIT_FOR:
                        errors.append(f"操作 {i+1} 失败: {result.error_message}")

                except Exception as e:
                    error_msg = f"执行操作 {i+1} 时发生异常: {str(e)}"
                    errors.append(error_msg)
                    operation_results.append({
                        'operation': operation.to_dict(),
                        'success': False,
                        'duration': 0,
                        'error_message': error_msg
                    })

            execution_time = time.time() - start_time
            success = len(errors) == 0

            result = ContainerExecutionResult(
                container_id=container.id,
                success=success,
                execution_time=execution_time,
                results=operation_results,
                errors=errors,
                metadata={
                    'session_id': context.session_id,
                    'page_url': context.page_url,
                    'operations_count': len(container.operations),
                    'executed_at': time.time()
                }
            )

            self.execution_history.append(result)
            return result

        except Exception as e:
            execution_time = time.time() - start_time
            error_msg = f"容器执行失败: {str(e)}"

            result = ContainerExecutionResult(
                container_id=container.id,
                success=False,
                execution_time=execution_time,
                errors=[error_msg],
                metadata={
                    'session_id': context.session_id,
                    'page_url': context.page_url,
                    'error_at': time.time()
                }
            )

            self.execution_history.append(result)
            return result

    async def _find_container_element(
        self,
        container: ContainerDefV2,
        context: ContainerExecutionContext
    ) -> Optional[Any]:
        """查找容器元素"""
        try:
            primary_selector = container.get_primary_selector()
            if not primary_selector:
                raise ValueError("容器没有定义选择器")

            # 构建CSS选择器字符串
            css_selector = "." + ".".join(primary_selector.classes)

            # 查找元素
            element = await context.browser_session.query_selector(css_selector)

            if element:
                return element

            # 如果主选择器失败，尝试备份选择器
            for selector in container.selectors:
                if selector.variant == SelectorVariant.BACKUP:
                    backup_css = "." + ".".join(selector.classes)
                    element = await context.browser_session.query_selector(backup_css)
                    if element:
                        return element

            return None

        except Exception as e:
            if context.debug_mode:
                print(f"查找容器元素时出错: {e}")
            return None

    async def _execute_single_operation(
        self,
        operation: OperationConfig,
        element_handle: Any,
        context: ContainerExecutionContext,
        operation_index: int
    ) -> OperationResult:
        """执行单个操作"""
        start_time = time.time()

        try:
            if operation.type == OperationType.FIND_CHILD:
                result_data = await self._execute_find_child(operation, element_handle, context)
            elif operation.type == OperationType.CLICK:
                result_data = await self._execute_click(operation, element_handle, context)
            elif operation.type == OperationType.TYPE:
                result_data = await self._execute_type(operation, element_handle, context)
            elif operation.type == OperationType.INPUT:
                result_data = await self._execute_input(operation, element_handle, context)
            elif operation.type == OperationType.SCROLL:
                result_data = await self._execute_scroll(operation, element_handle, context)
            elif operation.type == OperationType.WAIT_FOR:
                result_data = await self._execute_wait_for(operation, element_handle, context)
            elif operation.type == OperationType.HIGHLIGHT:
                result_data = await self._execute_highlight(operation, element_handle, context)
            elif operation.type == OperationType.CUSTOM:
                result_data = await self._execute_custom(operation, element_handle, context)
            elif operation.type == OperationType.EXTRACT:
                result_data = await self._execute_extract(operation, element_handle, context)
            else:
                raise ValueError(f"不支持的操作类型: {operation.type}")

            duration = time.time() - start_time
            return OperationResult(
                operation=operation,
                success=True,
                duration=duration,
                result_data=result_data,
                metadata={'operation_index': operation_index}
            )

        except Exception as e:
            duration = time.time() - start_time
            return OperationResult(
                operation=operation,
                success=False,
                duration=duration,
                error_message=str(e),
                metadata={'operation_index': operation_index}
            )

    async def _execute_find_child(
        self,
        operation: OperationConfig,
        parent_element: Any,
        context: ContainerExecutionContext
    ) -> Dict[str, Any]:
        """执行查找子元素操作"""
        config = operation.config

        # 从配置中获取子容器ID或选择器
        child_container_id = config.get('container_id')
        if child_container_id and child_container_id in context.container_library:
            child_container = context.container_library[child_container_id]
            child_selector = child_container.get_primary_selector()
            if child_selector:
                css_selector = "." + ".".join(child_selector.classes)
                child_elements = await parent_element.query_selector_all(css_selector)
                return {
                    'found_count': len(child_elements),
                    'child_container_id': child_container_id,
                    'selector': css_selector
                }

        # 或者直接使用配置中的选择器
        selector = config.get('selector')
        if selector:
            child_elements = await parent_element.query_selector_all(selector)
            return {
                'found_count': len(child_elements),
                'selector': selector
            }

        return {'found_count': 0}

    async def _execute_click(
        self,
        operation: OperationConfig,
        element: Any,
        context: ContainerExecutionContext
    ) -> Dict[str, Any]:
        """执行点击操作"""
        config = operation.config

        # 滚动到元素可见
        if config.get('scroll_to_view', True):
            await element.scroll_into_view_if_needed()

        # 等待元素可点击
        wait_time = config.get('wait_before', 0.1)
        if wait_time > 0:
            await asyncio.sleep(wait_time)

        # 使用反检测引擎进行点击
        if self.anti_detection_engine and context.anti_detection_enabled:
            css_selector = await self._get_element_css_selector(element)
            success = await self.anti_detection_engine.simulate_click(css_selector)
        else:
            await element.click()
            success = True

        # 点击后等待
        wait_after = config.get('wait_after', 0.2)
        if wait_after > 0:
            await asyncio.sleep(wait_after)

        return {
            'clicked': True,
            'success': success,
            'anti_detection_used': self.anti_detection_engine is not None
        }

    async def _execute_type(
        self,
        operation: OperationConfig,
        element: Any,
        context: ContainerExecutionContext
    ) -> Dict[str, Any]:
        """执行输入操作"""
        config = operation.config
        text = config.get('text', '')

        if not text:
            raise ValueError("TYPE操作需要text参数")

        # 先点击元素获得焦点
        await element.click()

        # 清空现有内容（如果需要）
        if config.get('clear_first', False):
            await element.fill('')

        # 使用反检测引擎进行输入
        if self.anti_detection_engine and context.anti_detection_enabled:
            css_selector = await self._get_element_css_selector(element)
            success = await self.anti_detection_engine.simulate_typing(css_selector, text)
        else:
            await element.fill(text)
            success = True

        return {
            'typed': True,
            'text': text,
            'success': success,
            'anti_detection_used': self.anti_detection_engine is not None
        }

    async def _execute_input(
        self,
        operation: OperationConfig,
        element: Any,
        context: ContainerExecutionContext
    ) -> Dict[str, Any]:
        """执行输入操作（TYPE的别名）"""
        return await self._execute_type(operation, element, context)

    async def _execute_scroll(
        self,
        operation: OperationConfig,
        element: Any,
        context: ContainerExecutionContext
    ) -> Dict[str, Any]:
        """执行滚动操作"""
        config = operation.config
        direction = config.get('direction', 'down')
        distance = config.get('distance', 300)

        # 如果指定了元素，在元素内滚动
        if element:
            if direction == 'down':
                await element.evaluate(f"el => el.scrollBy(0, {distance})")
            elif direction == 'up':
                await element.evaluate(f"el => el.scrollBy(0, -{distance})")
            elif direction == 'right':
                await element.evaluate(f"el => el.scrollBy({distance}, 0)")
            elif direction == 'left':
                await element.evaluate(f"el => el.scrollBy(-{distance}, 0)")
        else:
            # 页面级滚动
            await context.browser_session.evaluate(f"window.scrollBy(0, {distance})")

        return {
            'scrolled': True,
            'direction': direction,
            'distance': distance
        }

    async def _execute_wait_for(
        self,
        operation: OperationConfig,
        element: Any,
        context: ContainerExecutionContext
    ) -> Dict[str, Any]:
        """执行等待操作"""
        config = operation.config
        wait_time = config.get('duration', 1.0)

        await asyncio.sleep(wait_time)

        return {
            'waited': True,
            'duration': wait_time
        }

    async def _execute_highlight(
        self,
        operation: OperationConfig,
        element: Any,
        context: ContainerExecutionContext
    ) -> Dict[str, Any]:
        """执行高亮操作"""
        config = operation.config
        style = config.get('style', '2px solid #ff0000')
        duration = config.get('duration', 3000)  # 毫秒

        # 注入高亮样式
        highlight_script = f"""
        (element) => {{
            const originalStyle = element.style.border;
            element.style.border = '{style}';

            setTimeout(() => {{
                element.style.border = originalStyle;
            }}, {duration});
        }}
        """

        await element.evaluate(highlight_script)

        return {
            'highlighted': True,
            'style': style,
            'duration': duration
        }

    async def _execute_extract(
        self,
        operation: OperationConfig,
        element: Any,
        context: ContainerExecutionContext
    ) -> Dict[str, Any]:
        """执行内容提取操作"""
        config = operation.config or {}
        target = (config.get('target') or 'links').lower()
        selector = config.get('selector')
        attribute = config.get('attribute')
        include_text = config.get('include_text', True)
        include_html = config.get('include_html', False)
        text_strategy = config.get('text_strategy', 'innerText')
        whitelist = config.get('whitelist') or {}
        blacklist = config.get('blacklist') or {}

        try:
            max_items = int(config.get('max_items', 50))
        except Exception:
            max_items = 50
        max_items = max(1, min(max_items, 500))

        payload = {
            "target": target,
            "selector": selector,
            "attribute": attribute,
            "maxItems": max_items,
            "includeText": include_text,
            "includeHtml": include_html,
            "textStrategy": text_strategy,
            "whitelist": whitelist,
            "blacklist": blacklist,
        }

        script = """
        (root, cfg) => {
          const toArray = (value) => Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []);
          const normalizeFilters = (filters) => ({
            contains: toArray(filters && filters.contains).map(v => String(v).toLowerCase()),
            prefix: toArray(filters && filters.prefix).map(v => String(v).toLowerCase()),
            suffix: toArray(filters && filters.suffix).map(v => String(v).toLowerCase())
          });
          const whitelist = normalizeFilters(cfg.whitelist || {});
          const blacklist = normalizeFilters(cfg.blacklist || {});
          const hasRules = (rules) => Boolean(rules.contains.length || rules.prefix.length || rules.suffix.length);
          const matchesRules = (value, rules) => {
            if (!value) return false;
            const lower = value.toLowerCase();
            if (rules.contains.some(rule => lower.includes(rule))) return true;
            if (rules.prefix.some(rule => lower.startsWith(rule))) return true;
            if (rules.suffix.some(rule => lower.endsWith(rule))) return true;
            return false;
          };
          const passesFilters = (value) => {
            if (!value) return false;
            const trimmed = String(value).trim();
            if (!trimmed) return false;
            const lower = trimmed.toLowerCase();
            if (hasRules(blacklist) && matchesRules(lower, blacklist)) return false;
            if (hasRules(whitelist) && !matchesRules(lower, whitelist)) return false;
            return true;
          };

          const target = (cfg.target || 'links').toLowerCase();
          const defaultSelectors = { links: 'a', images: 'img' };
          const selector = cfg.selector || defaultSelectors[target] || null;
          let candidates = [];
          if (selector) {
            try {
              candidates = Array.from(root.querySelectorAll(selector));
            } catch (err) {
              candidates = [];
            }
          } else {
            candidates = [root];
          }

          const maxItems = Math.max(1, Math.min(cfg.maxItems || 50, 500));
          const includeText = cfg.includeText !== false;
          const includeHtml = !!cfg.includeHtml;
          const attribute = cfg.attribute || (target === 'images' ? 'src' : target === 'links' ? 'href' : null);
          const textProp = cfg.textStrategy === 'textContent' ? 'textContent' : 'innerText';

          const buildPath = (el) => {
            const chain = [];
            let current = el;
            while (current && current.nodeType === 1 && chain.length < 5) {
              let part = current.tagName.toLowerCase();
              if (current.id) {
                part += '#' + current.id;
              } else if (current.classList && current.classList.length) {
                part += '.' + current.classList[0];
              }
              chain.push(part);
              current = current.parentElement;
            }
            return chain.reverse().join(' > ');
          };

          const items = [];
          for (const el of candidates) {
            if (items.length >= maxItems) break;
            if (target === 'links') {
              const href = attribute ? (el.getAttribute(attribute) || '') : (el.href || '');
              if (!href) continue;
              if (!passesFilters(href)) continue;
              const entry = {
                type: 'link',
                href,
                text: includeText ? ((el[textProp] || '').trim()) : '',
                title: el.title || '',
                path: buildPath(el)
              };
              if (includeHtml) entry.html = el.outerHTML;
              items.push(entry);
            } else if (target === 'images') {
              const src = attribute ? (el.getAttribute(attribute) || '') : (el.currentSrc || el.src || '');
              if (!src) continue;
              if ((hasRules(whitelist) || hasRules(blacklist)) && !passesFilters(src)) continue;
              const entry = {
                type: 'image',
                src,
                alt: el.alt || '',
                path: buildPath(el)
              };
              if (includeHtml) entry.html = el.outerHTML;
              items.push(entry);
            } else {
              const textValue = (el[textProp] || '').trim();
              if (!textValue) continue;
              const entry = {
                type: 'text',
                text: textValue,
                path: buildPath(el)
              };
              if (includeHtml) entry.html = el.outerHTML;
              items.push(entry);
            }
          }

          return {
            target,
            items,
            totalCandidates: candidates.length,
            appliedFilters: {
              whitelist: hasRules(whitelist),
              blacklist: hasRules(blacklist)
            }
          };
        }
        """

        try:
            result = await element.evaluate(script, payload)
            return result
        except Exception as exc:
            raise RuntimeError(f"提取操作执行失败: {exc}")

    async def _execute_custom(
        self,
        operation: OperationConfig,
        element: Any,
        context: ContainerExecutionContext
    ) -> Dict[str, Any]:
        """执行自定义操作"""
        config = operation.config
        script = config.get('script')

        if not script:
            raise ValueError("CUSTOM操作需要script参数")

        # 执行自定义JavaScript
        result = await element.evaluate(script)

        return {
            'custom_executed': True,
            'result': result
        }

    async def _get_element_css_selector(self, element: Any) -> str:
        """获取元素的CSS选择器"""
        try:
            # 获取元素的class属性
            classes = await element.get_attribute('class')
            if classes:
                class_list = classes.strip().split()
                if class_list:
                    return "." + ".".join(class_list)

            # 如果没有class，返回其他选择器
            tag_name = await element.evaluate('el => el.tagName.toLowerCase()')
            return tag_name
        except:
            return 'element'

    def get_execution_history(self, limit: int = 50) -> List[ContainerExecutionResult]:
        """获取执行历史"""
        return self.execution_history[-limit:]

    def get_execution_stats(self) -> Dict[str, Any]:
        """获取执行统计"""
        if not self.execution_history:
            return {}

        total_executions = len(self.execution_history)
        successful_executions = sum(1 for r in self.execution_history if r.success)
        total_time = sum(r.execution_time for r in self.execution_history)

        return {
            'total_executions': total_executions,
            'successful_executions': successful_executions,
            'success_rate': successful_executions / total_executions if total_executions > 0 else 0,
            'average_execution_time': total_time / total_executions if total_executions > 0 else 0,
            'total_execution_time': total_time
        }
