"""仪表盘 API"""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.job import Job
from ..models.execution import Execution

router = APIRouter(prefix="/api/dashboard", tags=["仪表盘"])


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """获取仪表盘统计数据"""
    total_jobs = (await db.execute(select(func.count(Job.id)))).scalar()
    online_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.status == "online")
    )).scalar()

    total_execs = (await db.execute(select(func.count(Execution.id)))).scalar()
    success_execs = (await db.execute(
        select(func.count(Execution.id)).where(Execution.status == "success")
    )).scalar()

    return {
        "code": 200,
        "data": {
            "total_jobs": total_jobs,
            "online_jobs": online_jobs,
            "total_executions": total_execs,
            "success_executions": success_execs,
        },
    }
