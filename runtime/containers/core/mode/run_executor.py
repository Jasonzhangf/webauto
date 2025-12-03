"""
Run Mode Executor - 运行模式执行器
"""

import asyncio
from typing import Any, Dict, List, Optional, Callable
from datetime import datetime
from enum import Enum
from collections import deque

from ..nodes.node_interface import NodeInterface, ExecutionContext, NodeResult
from ..nodes.registry import NodeRegistry
from ..executor import PythonExecutor


class ExecutionStatus(Enum):
    """执行状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RunModeExecutor:
    """运行模式执行器"""

    def __init__(self):
        self.node_registry = NodeRegistry()
        self.logger = None

        # 执行状态管理
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
        self.execution_queues: Dict[str, asyncio.PriorityQueue] = {}
        self.execution_workers: Dict[str, asyncio.Task] = {}
        self.execution_status: Dict[str, Dict[str, Any]] = {}

        # 执行历史记录（限制大小）
        self.max_history_size = 1000

    async def initialize(self, session_id: str, browser_session: Any) -> bool:
        """初始化运行模式"""
        try:
            # 创建PythonExecutor实例
            python_executor = self._create_python_executor(browser_session)
            if not python_executor:
                raise RuntimeError("Failed to create PythonExecutor")

            await python_executor.start()

            self.active_sessions[session_id] = {
                'browser_session': browser_session,
                'python_executor': python_executor,
                'initialized_at': datetime.utcnow(),
                'executions': deque(maxlen=self.max_history_size),
                'status': ExecutionStatus.RUNNING
            }

            # 创建优先级队列
            self.execution_queues[session_id] = asyncio.PriorityQueue()

            # 创建执行状态跟踪
            self.execution_status[session_id] = {
                'total_executed': 0,
                'successful': 0,
                'failed': 0,
                'currently_running': None,
                'start_time': datetime.utcnow()
            }

            # 启动后台worker
            worker_task = asyncio.create_task(
                self._execution_worker(session_id),
                name=f"run-executor-{session_id}"
            )
            self.execution_workers[session_id] = worker_task

            if self.logger:
                self.logger.info(f"Run mode executor initialized for session {session_id}")

            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to initialize run mode executor: {error}")
            return False

    async def cleanup(self, session_id: str) -> bool:
        """清理运行模式"""
        try:
            # 停止PythonExecutor
            if session_id in self.active_sessions:
                python_executor = self.active_sessions[session_id].get('python_executor')
                if python_executor:
                    await python_executor.stop()

                # 停止worker
                if session_id in self.execution_workers:
                    worker_task = self.execution_workers[session_id]
                    worker_task.cancel()
                    try:
                        await worker_task
                    except asyncio.CancelledError:
                        pass
                    del self.execution_workers[session_id]

                # 清理队列
                if session_id in self.execution_queues:
                    queue = self.execution_queues[session_id]
                    # 清空队列
                    while not queue.empty():
                        queue.get_nowait()

                    del self.execution_queues[session_id]

                # 清理状态
                if session_id in self.execution_status:
                    del self.execution_status[session_id]

                # 标记会话为已清理
                self.active_sessions[session_id]['status'] = ExecutionStatus.COMPLETED
                del self.active_sessions[session_id]

            if self.logger:
                self.logger.info(f"Run mode executor cleaned up for session {session_id}")

            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to cleanup run mode executor: {error}")
            return False

    async def execute_node(self, session_id: str, node_type: str,
                          parameters: Dict[str, Any]) -> NodeResult:
        """执行单个Node"""
        try:
            if session_id not in self.active_sessions:
                return NodeResult(
                    success=False,
                    error=f"Session {session_id} not initialized"
                )

            # 创建Node实例
            node = self.node_registry.create_node(node_type, parameters)

            # 创建执行上下文
            session_data = self.active_sessions.get(session_id)
            if not session_data:
                return NodeResult(
                    success=False,
                    error=f"Session {session_id} not found"
                )

            python_executor = session_data.get('python_executor')
            if not python_executor:
                return NodeResult(
                    success=False,
                    error=f"PythonExecutor not available for session {session_id}"
                )

            execution_context = ExecutionContext(
                session_id=session_id,
                python_executor=python_executor
            )

            # 执行Node（带重试机制）
            result = await node.execute_with_retry(execution_context)

            # 记录执行结果
            execution_record = {
                'node_type': node_type,
                'parameters': parameters,
                'result': result.to_dict(),
                'timestamp': datetime.utcnow()
            }

            self.active_sessions[session_id]['executions'].append(execution_record)

            if self.logger:
                self.logger.info(
                    f"Node {node_type} executed for session {session_id}: "
                    f"success={result.success}"
                )

            return result

        except Exception as error:
            if self.logger:
                self.logger.error(f"Node execution failed: {error}")

            return NodeResult(
                success=False,
                error=str(error)
            )

    async def execute_workflow(self, session_id: str, workflow: List[Dict[str, Any]]) -> List[NodeResult]:
        """执行工作流"""
        try:
            if session_id not in self.active_sessions:
                return [NodeResult(
                    success=False,
                    error=f"Session {session_id} not initialized"
                )]

            results = []

            for step in workflow:
                node_type = step.get('type')
                parameters = step.get('parameters', {})

                if not node_type:
                    results.append(NodeResult(
                        success=False,
                        error="Missing node type in workflow step"
                    ))
                    continue

                # 执行Node
                result = await self.execute_node(session_id, node_type, parameters)
                results.append(result)

                # 如果执行失败，根据配置决定是否继续
                if not result.success and step.get('required', True):
                    if self.logger:
                        self.logger.warning(
                            f"Required node {node_type} failed, stopping workflow"
                        )
                    break

            return results

        except Exception as error:
            if self.logger:
                self.logger.error(f"Workflow execution failed: {error}")

            return [NodeResult(
                success=False,
                error=str(error)
            )]

    async def queue_execution(self, session_id: str, node_type: str,
                             parameters: Dict[str, Any], priority: int = 0) -> str:
        """将Node加入执行队列"""
        try:
            if session_id not in self.active_sessions:
                raise ValueError(f"Session {session_id} not initialized")

            if session_id not in self.execution_queues:
                raise ValueError(f"Execution queue not available for session {session_id}")

            execution_id = f"exec_{int(datetime.utcnow().timestamp() * 1000000)}"

            # 优先级转换为负数（PriorityQueue是最小堆）
            priority_score = -priority

            execution_task = {
                'execution_id': execution_id,
                'node_type': node_type,
                'parameters': parameters,
                'priority': priority,
                'queued_at': datetime.utcnow(),
                'status': ExecutionStatus.PENDING
            }

            # 加入优先级队列
            queue = self.execution_queues[session_id]
            await queue.put((priority_score, execution_id, execution_task))

            # 更新执行状态
            self.execution_status[session_id]['queued_count'] = (
                self.execution_status[session_id].get('queued_count', 0) + 1
            )

            if self.logger:
                self.logger.info(f"Node {node_type} queued for session {session_id} with ID {execution_id}")

            return execution_id

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to queue execution: {error}")
            raise

    async def execute_queued(self, session_id: str) -> List[NodeResult]:
        """执行队列中的所有任务"""
        try:
            if session_id not in self.execution_queue:
                return []

            queue = self.execution_queue[session_id]
            if not queue:
                return []

            results = []

            # 按优先级执行队列中的任务
            while queue:
                task = queue.pop(0)
                task['status'] = ExecutionStatus.RUNNING
                task['started_at'] = datetime.utcnow()

                try:
                    result = await self.execute_node(
                        session_id,
                        task['node_type'],
                        task['parameters']
                    )

                    task['status'] = ExecutionStatus.COMPLETED if result.success else ExecutionStatus.FAILED
                    task['completed_at'] = datetime.utcnow()
                    task['result'] = result.to_dict()

                    results.append(result)

                except Exception as error:
                    task['status'] = ExecutionStatus.FAILED
                    task['completed_at'] = datetime.utcnow()
                    task['error'] = str(error)

                    results.append(NodeResult(
                        success=False,
                        error=str(error)
                    ))

            return results

        except Exception as error:
            if self.logger:
                self.logger.error(f"Queue execution failed: {error}")
            return [NodeResult(
                success=False,
                error=str(error)
            )]

    def get_queue_status(self, session_id: str) -> Dict[str, Any]:
        """获取队列状态"""
        if session_id not in self.execution_queues:
            return {'exists': False}

        queue = self.execution_queues[session_id]
        status_data = self.execution_status.get(session_id, {})

        # 获取队列大小（不完全准确，因为队列在异步处理）
        queue_size = queue.qsize()

        return {
            'exists': True,
            'queue_size': queue_size,
            'currently_running': status_data.get('currently_running'),
            'total_executed': status_data.get('total_executed', 0),
            'successful': status_data.get('successful', 0),
            'failed': status_data.get('failed', 0),
            'success_rate': (
                status_data.get('successful', 0) / max(1, status_data.get('total_executed', 1))
            ),
            'start_time': status_data.get('start_time'),
            'worker_active': session_id in self.execution_workers
        }

    def get_execution_history(self, session_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """获取执行历史"""
        if session_id not in self.active_sessions:
            return []

        executions = self.active_sessions[session_id]['executions']
        return executions[-limit:] if executions else []

    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """获取会话统计信息"""
        if session_id not in self.active_sessions:
            return {'exists': False}

        session_data = self.active_sessions[session_id]
        executions = session_data['executions']

        total_executions = len(executions)
        successful_executions = sum(1 for exec_data in executions if exec_data['result']['success'])
        failed_executions = total_executions - successful_executions

        # 计算平均执行时间
        execution_times = [
            exec_data['result']['execution_time']
            for exec_data in executions
            if exec_data['result'].get('execution_time')
        ]
        avg_execution_time = sum(execution_times) / len(execution_times) if execution_times else 0

        return {
            'exists': True,
            'initialized_at': session_data['initialized_at'].isoformat(),
            'status': session_data['status'].value,
            'total_executions': total_executions,
            'successful_executions': successful_executions,
            'failed_executions': failed_executions,
            'success_rate': successful_executions / total_executions if total_executions > 0 else 0,
            'average_execution_time': avg_execution_time,
            'queue_status': self.get_queue_status(session_id)
        }

    async def cancel_queued_execution(self, session_id: str, execution_id: str) -> bool:
        """取消队列中的特定执行"""
        try:
            if session_id not in self.execution_queue:
                return False

            queue = self.execution_queue[session_id]
            for task in queue:
                if task['execution_id'] == execution_id and task['status'] == ExecutionStatus.PENDING:
                    task['status'] = ExecutionStatus.CANCELLED
                    task['cancelled_at'] = datetime.utcnow()

                    if self.logger:
                        self.logger.info(f"Execution {execution_id} cancelled for session {session_id}")

                    return True

            return False

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to cancel execution: {error}")
            return False

    def _create_python_executor(self, browser_session: Any) -> Optional[PythonExecutor]:
        """创建Python执行器"""
        try:
            # 根据浏览器会话创建PythonExecutor
            # 这里需要与实际的浏览器系统集成
            # 暂时创建一个基础的PythonExecutor实例
            return PythonExecutor(max_workers=4)

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to create PythonExecutor: {error}")
            return None

    async def _execution_worker(self, session_id: str):
        """后台执行worker"""
        try:
            queue = self.execution_queues.get(session_id)
            if not queue:
                return

            while True:
                # 获取下一个任务（阻塞等待）
                priority_score, execution_id, execution_task = await queue.get()

                # 检查是否是停止信号
                if execution_id == 'STOP':
                    break

                try:
                    # 更新状态为运行中
                    self.execution_status[session_id]['currently_running'] = execution_id
                    execution_task['status'] = ExecutionStatus.RUNNING
                    execution_task['started_at'] = datetime.utcnow()

                    # 执行任务
                    result = await self.execute_node(
                        session_id,
                        execution_task['node_type'],
                        execution_task['parameters']
                    )

                    # 更新状态
                    if result.success:
                        self.execution_status[session_id]['successful'] += 1
                    else:
                        self.execution_status[session_id]['failed'] += 1

                    execution_task['status'] = ExecutionStatus.COMPLETED if result.success else ExecutionStatus.FAILED
                    execution_task['completed_at'] = datetime.utcnow()
                    execution_task['result'] = result.to_dict()

                    # 记录执行历史
                    self.active_sessions[session_id]['executions'].append({
                        'execution_id': execution_id,
                        'node_type': execution_task['node_type'],
                        'result': result.to_dict(),
                        'timestamp': datetime.utcnow()
                    })

                    self.execution_status[session_id]['total_executed'] += 1

                except Exception as error:
                    # 处理执行异常
                    self.execution_status[session_id]['failed'] += 1
                    self.execution_status[session_id]['total_executed'] += 1

                    execution_task['status'] = ExecutionStatus.FAILED
                    execution_task['completed_at'] = datetime.utcnow()
                    execution_task['error'] = str(error)

                    if self.logger:
                        self.logger.error(f"Execution failed for {execution_id}: {error}")

                finally:
                    # 清理当前运行状态
                    self.execution_status[session_id]['currently_running'] = None
                    queue.task_done()

        except asyncio.CancelledError:
            if self.logger:
                self.logger.info(f"Execution worker for session {session_id} cancelled")
        except Exception as error:
            if self.logger:
                self.logger.error(f"Execution worker error for session {session_id}: {error}")