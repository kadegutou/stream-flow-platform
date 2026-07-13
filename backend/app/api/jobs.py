"""作业管理 API"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from ..database import get_db
from ..models.job import Job
from ..models.execution import Execution
from ..engine.job_runner import job_runner

router = APIRouter(prefix="/api/jobs", tags=["作业管理"])


class JobCreate(BaseModel):
    name: str
    description: str | None = None
    dag_config: str | None = None


class JobUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    dag_config: str | None = None


class DAGValidateRequest(BaseModel):
    nodes: list[dict]
    edges: list[dict]


@router.get("")
async def list_jobs(
    status: str | None = None,
    page: int = 1,
    size: int = 10,
    db: AsyncSession = Depends(get_db),
):
    query = select(Job)
    count_q = select(func.count(Job.id))
    if status:
        query = query.where(Job.status == status)
        count_q = count_q.where(Job.status == status)

    offset = (page - 1) * size
    total = (await db.execute(count_q)).scalar()
    result = await db.execute(query.order_by(Job.id.desc()).offset(offset).limit(size))
    jobs = result.scalars().all()

    return {
        "code": 200,
        "data": {"records": jobs, "total": total, "page": page, "size": size},
    }


@router.get("/{job_id}")
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "作业不存在")
    return {"code": 200, "data": job}


@router.post("")
async def create_job(data: JobCreate, db: AsyncSession = Depends(get_db)):
    job = Job(**data.model_dump())
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return {"code": 200, "data": job}


@router.put("/{job_id}")
async def update_job(job_id: int, data: JobUpdate, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "作业不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(job, k, v)
    await db.commit()
    return {"code": 200, "data": job}


@router.delete("/{job_id}")
async def delete_job(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "作业不存在")
    await db.delete(job)
    await db.commit()
    return {"code": 200, "message": "删除成功"}


@router.post("/{job_id}/online")
async def online_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """上线作业"""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "作业不存在")

    job.status = "online"
    await db.commit()

    # 通知引擎启动执行
    await job_runner.start_job(job_id)

    return {"code": 200, "message": "作业已上线"}


@router.post("/{job_id}/offline")
async def offline_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """下线作业"""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "作业不存在")

    job.status = "offline"
    await db.commit()

    # 通知引擎停止执行
    await job_runner.stop_job(job_id)

    return {"code": 200, "message": "作业已下线"}


@router.post("/validate")
async def validate_dag(data: DAGValidateRequest):
    """
    DAG 校验 — Kahn 算法检测环路 (来自 Pipeline UI 参考实现)
    返回: { valid: bool, node_count: int, edge_count: int, errors: [...] }
    """
    from collections import defaultdict, deque

    nodes = data.nodes
    edges = data.edges

    errors: list[str] = []

    if not nodes:
        errors.append("DAG 中没有节点")
        return {"code": 200, "data": {"valid": False, "node_count": 0, "edge_count": 0, "errors": errors}}

    node_ids = {n["id"] for n in nodes}

    # 检查孤立节点 (输入控件除外)
    connected_ids: set[str] = set()
    for e in edges:
        connected_ids.add(e.get("source", ""))
        connected_ids.add(e.get("target", ""))
    isolated = node_ids - connected_ids
    if isolated and len(nodes) > 1:
        errors.append(f"存在 {len(isolated)} 个孤立节点: {isolated}")

    # 构建邻接表
    adj: dict[str, list[str]] = defaultdict(list)
    in_degree: dict[str, int] = {nid: 0 for nid in node_ids}

    for e in edges:
        s = e.get("source", "")
        t = e.get("target", "")
        if s in in_degree and t in in_degree:
            adj[s].append(t)
            in_degree[t] += 1
        else:
            errors.append(f"边引用了不存在的节点: {s} → {t}")

    # Kahn 算法检测环
    queue = deque([nid for nid, d in in_degree.items() if d == 0])
    visited = 0

    while queue:
        nid = queue.popleft()
        visited += 1
        for neighbor in adj[nid]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    has_cycle = visited != len(node_ids)
    if has_cycle:
        errors.append(f"DAG 中存在环路: {len(node_ids) - visited} 个节点无法拓扑排序")

    # 检查输出控件
    output_nodes = [n for n in nodes if "output" in (n.get("component_name", "") or "").lower()]
    if not output_nodes:
        errors.append("DAG 中缺少输出控件，数据没有落盘目标")

    return {
        "code": 200,
        "data": {
            "valid": not has_cycle and len(errors) == 0,
            "node_count": len(nodes),
            "edge_count": len(edges),
            "has_cycle": has_cycle,
            "errors": errors,
        },
    }


@router.get("/{job_id}/executions")
async def get_executions(
    job_id: int,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """获取作业执行历史"""
    query = (
        select(Execution)
        .where(Execution.job_id == job_id)
        .order_by(Execution.started_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(query)
    executions = result.scalars().all()
    return {"code": 200, "data": executions}


@router.get("/{job_id}/status")
async def get_job_status(job_id: int, db: AsyncSession = Depends(get_db)):
    """获取作业最新执行状态"""
    result = await db.execute(
        select(Execution)
        .where(Execution.job_id == job_id)
        .order_by(Execution.started_at.desc())
        .limit(1)
    )
    execution = result.scalar_one_or_none()
    return {"code": 200, "data": execution}
