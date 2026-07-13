"""
作业运行管理 - 负责接收上线/下线指令，协调执行
"""

import json
import asyncio
import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.job import Job
from ..models.execution import Execution
from .dag_executor import executor

logger = logging.getLogger(__name__)


class JobRunner:
    """作业运行管理器"""

    def __init__(self):
        self._running_tasks: dict[int, asyncio.Task] = {}
        self._stop_flags: dict[int, bool] = {}

    async def start_job(self, job_id: int):
        """上线启动一个作业"""
        if job_id in self._running_tasks:
            logger.warning(f"作业 {job_id} 已在运行中")
            return

        self._stop_flags[job_id] = False

        async def _run_loop():
            while not self._stop_flags.get(job_id, True):
                async with async_session() as db:
                    try:
                        job = await db.get(Job, job_id)
                        if job is None or job.status != "online":
                            break

                        dag_config = json.loads(job.dag_config or "{}")

                        # 创建执行记录
                        exec_rec = Execution(job_id=job_id, status="running")
                        db.add(exec_rec)
                        await db.commit()

                        # 执行 DAG
                        start = datetime.now()
                        result = await executor.execute(job_id, dag_config)
                        elapsed = (datetime.now() - start).total_seconds()

                        # 更新执行记录
                        exec_rec.status = result.get("status", "failed")
                        exec_rec.rows_processed = result.get("rows_processed", 0)
                        exec_rec.finished_at = datetime.now()
                        exec_rec.error_msg = result.get("error")
                        exec_rec.log = json.dumps({"elapsed": elapsed, "result": result})
                        await db.commit()

                        logger.info(f"作业 {job_id} 执行完成: {result}, 耗时 {elapsed:.2f}s")

                    except Exception as e:
                        logger.error(f"作业 {job_id} 执行异常: {e}")

                    await asyncio.sleep(5)  # 轮询间隔

            logger.info(f"作业 {job_id} 已停止")

        task = asyncio.create_task(_run_loop())
        self._running_tasks[job_id] = task

    async def stop_job(self, job_id: int):
        """下线停止一个作业"""
        self._stop_flags[job_id] = True
        task = self._running_tasks.pop(job_id, None)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        logger.info(f"作业 {job_id} 已标记下线")


# 全局单例
job_runner = JobRunner()
