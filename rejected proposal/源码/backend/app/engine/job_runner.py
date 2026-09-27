"""
作业运行管理 - 负责接收上线/下线指令，协调执行

执行模型:
  - 流式作业（含 kafka-input）: 持续循环执行，直到下线
  - 一次性作业（文件/数据库输入）: 上线后执行一次即完成，状态回到 offline
  - 执行失败: 作业状态回写为 error
"""

import json
import asyncio
import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.job import Job
from ..models.execution import Execution
from .dag_executor import executor

logger = logging.getLogger(__name__)

# 流式输入控件（作业含这些控件时持续执行）
STREAMING_INPUTS = {"kafka-input"}

# 轮询间隔（仅流式作业）
POLL_INTERVAL = 5


class JobRunner:
    """作业运行管理器"""

    def __init__(self):
        self._running_tasks: dict[int, asyncio.Task] = {}
        self._stop_flags: dict[int, bool] = {}

    @staticmethod
    def _is_streaming(dag_config: dict) -> bool:
        return any(
            n.get("component_name") in STREAMING_INPUTS
            for n in dag_config.get("nodes", [])
        )

    async def _execute_once(self, db: AsyncSession, job: Job, dag_config: dict) -> str:
        """执行一轮 DAG，写入执行记录，返回结果状态"""
        exec_rec = Execution(job_id=job.id, status="running")
        db.add(exec_rec)
        await db.commit()

        start = datetime.now()
        result = await executor.execute(
            job.id, dag_config,
            cancel_check=lambda: self._stop_flags.get(job.id, False),
        )
        elapsed = (datetime.now() - start).total_seconds()

        status = result.get("status", "error")
        exec_rec.status = "success" if status == "success" else "failed"
        exec_rec.rows_processed = result.get("rows_processed", 0)
        exec_rec.finished_at = datetime.now()
        exec_rec.error_msg = result.get("error")
        exec_rec.log = json.dumps(
            {"elapsed": elapsed, "result": result}, ensure_ascii=False, default=str
        )
        await db.commit()

        logger.info(f"作业 {job.id} 执行完成: {status}, 耗时 {elapsed:.2f}s")
        return status

    async def start_job(self, job_id: int):
        """上线启动一个作业"""
        if job_id in self._running_tasks:
            logger.warning(f"作业 {job_id} 已在运行中")
            return

        self._stop_flags[job_id] = False

        async def _run_loop():
            try:
                while not self._stop_flags.get(job_id, True):
                    async with async_session() as db:
                        job = await db.get(Job, job_id)
                        if job is None or job.status != "online":
                            break

                        try:
                            dag_config = json.loads(job.dag_config or "{}")
                        except json.JSONDecodeError as e:
                            logger.error(f"作业 {job_id} DAG 配置解析失败: {e}")
                            job.status = "error"
                            await db.commit()
                            break

                        streaming = self._is_streaming(dag_config)

                        try:
                            status = await self._execute_once(db, job, dag_config)
                        except Exception as e:
                            logger.exception(f"作业 {job_id} 执行异常: {e}")
                            job.status = "error"
                            await db.commit()
                            break

                        # DAG 级失败(error) 或节点级失败(partial) → 回写 error 并停止
                        if status in ("error", "partial"):
                            job.status = "error"
                            await db.commit()
                            break

                        # 一次性作业 → 执行一轮即完成，回到 offline
                        if not streaming:
                            job.status = "offline"
                            await db.commit()
                            break

                    await asyncio.sleep(POLL_INTERVAL)  # 仅流式作业会走到这里
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.exception(f"作业 {job_id} 运行循环异常: {e}")
            finally:
                self._running_tasks.pop(job_id, None)
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
