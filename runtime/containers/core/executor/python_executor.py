"""
Python Executor - 浏览器操作的底层执行引擎
"""

import asyncio
import uuid
from typing import Any, Dict, List, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import logging

from ..nodes.node_interface import NodeResult, ExtractType
from .jobs import Job, NavigateJob, QueryJob, ClickJob, InputJob, WaitJob


class JobStatus(Enum):
    """任务状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class JobResult:
    """任务执行结果"""
    job_id: str
    status: JobStatus
    data: Optional[Any] = None
    error: Optional[str] = None
    execution_time: float = 0.0
    timestamp: datetime = field(default_factory=datetime.utcnow)


class AsyncJobQueue:
    """异步任务队列"""

    def __init__(self, max_workers: int = 4):
        self.max_workers = max_workers
        self.queue: asyncio.Queue = asyncio.Queue()
        self.workers: List[asyncio.Task] = []
        self.running = False
        self.logger = logging.getLogger(__name__)

    async def start(self):
        """启动工作线程"""
        if self.running:
            return

        self.running = True
        self.workers = [
            asyncio.create_task(self._worker(f"worker-{i}"))
            for i in range(self.max_workers)
        ]
        self.logger.info(f"AsyncJobQueue started with {self.max_workers} workers")

    async def stop(self):
        """停止工作线程"""
        if not self.running:
            return

        self.logger.info("AsyncJobQueue stopping...")

        # 先设置停止标志
        self.running = False

        # 等待所有任务完成，但有超时限制
        try:
            await asyncio.wait_for(self.queue.join(), timeout=10.0)
        except asyncio.TimeoutError:
            self.logger.warning("Queue join timeout, forcing stop")

        # 发送停止信号到队列（sentinel jobs）
        for _ in self.workers:
            await self.queue.put(None)  # None作为停止信号

        # 取消所有worker任务
        for worker in self.workers:
            worker.cancel()

        # 等待worker任务完成
        await asyncio.gather(*self.workers, return_exceptions=True)

        self.logger.info("AsyncJobQueue stopped")

    async def _worker(self, worker_id: str):
        """工作线程"""
        while self.running:
            try:
                job = await asyncio.wait_for(
                    self.queue.get(),
                    timeout=1.0
                )

                # 检查是否是停止信号
                if job is None:
                    break

                await self._execute_job(job, worker_id)
                self.queue.task_done()
            except asyncio.TimeoutError:
                continue
            except Exception as error:
                self.logger.error(f"Worker {worker_id} error: {error}")

        self.logger.info(f"Worker {worker_id} stopped")

    async def _execute_job(self, job: Job, worker_id: str):
        """执行具体任务"""
        try:
            self.logger.info(f"Worker {worker_id} executing job {job.job_id}")
            result = await job.execute()
            job.set_result(result)
        except Exception as error:
            self.logger.error(f"Job {job.job_id} failed: {error}")
            job.set_result(JobResult(
                job_id=job.job_id,
                status=JobStatus.FAILED,
                error=str(error)
            ))

    async def execute(self, job: Job) -> JobResult:
        """提交任务并等待完成"""
        if not self.running:
            await self.start()

        # 将任务加入队列
        await self.queue.put(job)

        # 等待任务完成
        return await job.wait_for_completion()

    def get_queue_size(self) -> int:
        """获取队列大小"""
        return self.queue.qsize()

    def get_active_workers(self) -> int:
        """获取活跃工作线程数"""
        return len([w for w in self.workers if not w.done()])


class BrowserManager:
    """浏览器管理器"""

    def __init__(self):
        self.browsers: Dict[str, Any] = {}
        self.logger = logging.getLogger(__name__)

    async def get_browser(self, session_id: str) -> Any:
        """获取浏览器实例"""
        if session_id not in self.browsers:
            # 这里应该创建新的浏览器实例
            # 暂时返回模拟对象
            self.browsers[session_id] = {
                'session_id': session_id,
                'created_at': datetime.utcnow()
            }

        return self.browsers[session_id]

    async def close_browser(self, session_id: str):
        """关闭浏览器实例"""
        if session_id in self.browsers:
            del self.browsers[session_id]


class PythonExecutor:
    """Python执行器"""

    def __init__(self, browser_manager: Optional[BrowserManager] = None,
                 max_workers: int = 4):
        self.browser_manager = browser_manager or BrowserManager()
        self.job_queue = AsyncJobQueue(max_workers=max_workers)
        self.logger = logging.getLogger(__name__)

    async def start(self):
        """启动执行器"""
        await self.job_queue.start()
        self.logger.info("PythonExecutor started")

    async def stop(self):
        """停止执行器"""
        await self.job_queue.stop()
        self.logger.info("PythonExecutor stopped")

    async def execute_navigate(self, session_id: str, url: str, wait_for: Optional[str] = None) -> NodeResult:
        """执行导航操作"""
        job = NavigateJob(session_id, self.browser_manager, url, wait_for)
        job_result = await self.job_queue.execute(job)

        return NodeResult(
            success=job_result.status == JobStatus.COMPLETED,
            data=job_result.data,
            error=job_result.error,
            execution_time=job_result.execution_time
        )

    async def execute_query(self, session_id: str, selector: str, extract_type: ExtractType,
                           attribute: Optional[str] = None, multiple: bool = False) -> NodeResult:
        """执行查询操作"""
        job = QueryJob(session_id, self.browser_manager, selector, extract_type, attribute, multiple)
        job_result = await self.job_queue.execute(job)

        return NodeResult(
            success=job_result.status == JobStatus.COMPLETED,
            data=job_result.data,
            error=job_result.error,
            execution_time=job_result.execution_time
        )

    async def execute_click(self, session_id: str, selector: str, wait_before: int = 0,
                          wait_after: int = 0) -> NodeResult:
        """执行点击操作"""
        job = ClickJob(session_id, self.browser_manager, selector, wait_before, wait_after)
        job_result = await self.job_queue.execute(job)

        return NodeResult(
            success=job_result.status == JobStatus.COMPLETED,
            data=job_result.data,
            error=job_result.error,
            execution_time=job_result.execution_time
        )

    async def execute_input(self, session_id: str, selector: str, value: str,
                          clear_first: bool = True) -> NodeResult:
        """执行输入操作"""
        job = InputJob(session_id, self.browser_manager, selector, value, clear_first)
        job_result = await self.job_queue.execute(job)

        return NodeResult(
            success=job_result.status == JobStatus.COMPLETED,
            data=job_result.data,
            error=job_result.error,
            execution_time=job_result.execution_time
        )

    async def execute_wait(self, session_id: str, selector: Optional[str] = None, timeout: int = 30000,
                          wait_type: str = 'element') -> NodeResult:
        """执行等待操作"""
        job = WaitJob(session_id, self.browser_manager, selector, timeout, wait_type)
        job_result = await self.job_queue.execute(job)

        return NodeResult(
            success=job_result.status == JobStatus.COMPLETED,
            data=job_result.data,
            error=job_result.error,
            execution_time=job_result.execution_time
        )

    def get_status(self) -> Dict[str, Any]:
        """获取执行器状态"""
        return {
            'queue_size': self.job_queue.get_queue_size(),
            'active_workers': self.job_queue.get_active_workers(),
            'max_workers': self.job_queue.max_workers,
            'running': self.job_queue.running
        }