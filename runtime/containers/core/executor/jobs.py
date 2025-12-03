"""
Job定义 - 具体的浏览器操作任务
"""

import asyncio
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid

from .python_executor import JobResult, JobStatus
from ..nodes.node_interface import ExtractType


class Job(ABC):
    """任务抽象基类"""

    def __init__(self, session_id: str, browser_manager: 'BrowserManager'):
        self.job_id = str(uuid.uuid4())
        self.session_id = session_id
        self.browser_manager = browser_manager
        self.created_at = datetime.utcnow()
        self._result: Optional[JobResult] = None
        self._completion_event = asyncio.Event()

    @abstractmethod
    async def _execute(self, browser_instance: Any) -> Any:
        """具体执行逻辑"""
        pass

    async def execute(self) -> JobResult:
        """执行任务"""
        start_time = time.time()

        try:
            # 获取浏览器实例
            browser_instance = await self.browser_manager.get_browser(self.session_id)

            data = await self._execute(browser_instance)
            execution_time = time.time() - start_time

            result = JobResult(
                job_id=self.job_id,
                status=JobStatus.COMPLETED,
                data=data,
                execution_time=execution_time
            )
            self.set_result(result)
            return result

        except Exception as error:
            execution_time = time.time() - start_time

            result = JobResult(
                job_id=self.job_id,
                status=JobStatus.FAILED,
                error=str(error),
                execution_time=execution_time
            )
            self.set_result(result)
            return result

    def set_result(self, result: JobResult):
        """设置任务结果"""
        self._result = result
        self._completion_event.set()

    async def wait_for_completion(self) -> JobResult:
        """等待任务完成"""
        await self._completion_event.wait()
        return self._result

    @property
    def result(self) -> Optional[JobResult]:
        """获取任务结果"""
        return self._result


class NavigateJob(Job):
    """导航任务"""

    def __init__(self, session_id: str, browser_manager: 'BrowserManager',
                 url: str, wait_for: Optional[str] = None):
        super().__init__(session_id, browser_manager)
        self.url = url
        self.wait_for = wait_for

    async def _execute(self, browser_instance: Any) -> Dict[str, Any]:
        """执行导航操作"""
        # 模拟导航操作
        print(f"Navigating to {self.url}")

        if self.wait_for:
            print(f"Waiting for element: {self.wait_for}")
            # 模拟等待
            await asyncio.sleep(0.5)

        # 模拟导航时间
        await asyncio.sleep(1.0)

        return {
            'url': self.url,
            'title': f'Page {self.url}',
            'timestamp': datetime.utcnow().isoformat(),
            'wait_for': self.wait_for
        }


class QueryJob(Job):
    """查询任务"""

    def __init__(self, session_id: str, browser_manager: 'BrowserManager',
                 selector: str, extract_type: ExtractType,
                 attribute: Optional[str] = None, multiple: bool = False):
        super().__init__(session_id, browser_manager)
        self.selector = selector
        self.extract_type = extract_type
        self.attribute = attribute
        self.multiple = multiple

    async def _execute(self, browser_instance: Any) -> Any:
        """执行查询操作"""
        # 模拟查询操作
        print(f"Querying {self.selector} with {self.extract_type.value}")

        # 模拟查询时间
        await asyncio.sleep(0.3)

        if self.multiple:
            # 返回多个结果
            return [
                {
                    'selector': self.selector,
                    'text': f'Element {i} text',
                    'html': f'<div class="element-{i}">Element {i} text</div>',
                    'attributes': {'class': f'element-{i}'}
                }
                for i in range(3)
            ]
        else:
            # 返回单个结果
            if self.extract_type == ExtractType.TEXT:
                return f'Extracted text from {self.selector}'
            elif self.extract_type == ExtractType.HTML:
                return f'<div>Extracted HTML from {self.selector}</div>'
            elif self.extract_type == ExtractType.ATTRIBUTE and self.attribute:
                return f'attribute-{self.attribute}-value'
            else:
                return {'selector': self.selector, 'found': True}


class ClickJob(Job):
    """点击任务"""

    def __init__(self, session_id: str, browser_manager: 'BrowserManager',
                 selector: str, wait_before: int = 0, wait_after: int = 0):
        super().__init__(session_id, browser_manager)
        self.selector = selector
        self.wait_before = wait_before
        self.wait_after = wait_after

    async def _execute(self, browser_instance: Any) -> Dict[str, Any]:
        """执行点击操作"""
        # 等待点击前
        if self.wait_before > 0:
            print(f"Waiting {self.wait_before}ms before click")
            await asyncio.sleep(self.wait_before / 1000.0)

        # 模拟点击操作
        print(f"Clicking {self.selector}")
        await asyncio.sleep(0.2)

        # 等待点击后
        if self.wait_after > 0:
            print(f"Waiting {self.wait_after}ms after click")
            await asyncio.sleep(self.wait_after / 1000.0)

        return {
            'selector': self.selector,
            'clicked': True,
            'timestamp': datetime.utcnow().isoformat(),
            'wait_before': self.wait_before,
            'wait_after': self.wait_after
        }


class InputJob(Job):
    """输入任务"""

    def __init__(self, session_id: str, browser_manager: 'BrowserManager',
                 selector: str, value: str, clear_first: bool = True):
        super().__init__(session_id, browser_manager)
        self.selector = selector
        self.value = value
        self.clear_first = clear_first

    async def _execute(self, browser_instance: Any) -> Dict[str, Any]:
        """执行输入操作"""
        # 模拟输入操作
        print(f"Input '{self.value}' to {self.selector}")

        if self.clear_first:
            print("Clearing input field first")
            await asyncio.sleep(0.1)

        # 模拟输入时间
        await asyncio.sleep(0.5)

        return {
            'selector': self.selector,
            'value': self.value,
            'cleared': self.clear_first,
            'timestamp': datetime.utcnow().isoformat()
        }


class WaitJob(Job):
    """等待任务"""

    def __init__(self, session_id: str, browser_manager: 'BrowserManager',
                 selector: Optional[str] = None, timeout: int = 30000,
                 wait_type: str = 'element'):
        super().__init__(session_id, browser_manager)
        self.selector = selector
        self.timeout = timeout
        self.wait_type = wait_type

    async def _execute(self, browser_instance: Any) -> Dict[str, Any]:
        """执行等待操作"""
        print(f"Waiting for {self.wait_type} with timeout {self.timeout}ms")

        if self.wait_type == 'time':
            # 固定时间等待
            wait_time = min(self.timeout, 2000)  # 最多等待2秒用于测试
            print(f"Waiting for {wait_time}ms")
            await asyncio.sleep(wait_time / 1000.0)
        else:
            # 模拟元素等待
            if self.selector:
                print(f"Waiting for element: {self.selector}")
                await asyncio.sleep(0.8)
            else:
                print("Waiting for page load")
                await asyncio.sleep(1.0)

        return {
            'wait_type': self.wait_type,
            'selector': self.selector,
            'timeout': self.timeout,
            'waited': True,
            'timestamp': datetime.utcnow().isoformat()
        }