"""控件管理 API"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from ..database import get_db
from ..models.component import Component
from ..engine.component_base import get_all_components

router = APIRouter(prefix="/api/components", tags=["控件管理"])


class ComponentCreate(BaseModel):
    name: str
    display_name: str
    type: str
    config_schema: str | None = None
    description: str | None = None
    icon: str | None = None


class ComponentUpdate(BaseModel):
    display_name: str | None = None
    config_schema: str | None = None
    description: str | None = None


@router.get("")
async def list_components(
    type: str | None = None,
    page: int = 1,
    size: int = 10,
    db: AsyncSession = Depends(get_db),
):
    query = select(Component)
    count_q = select(func.count(Component.id))

    if type:
        query = query.where(Component.type == type)
        count_q = count_q.where(Component.type == type)

    offset = (page - 1) * size
    total = (await db.execute(count_q)).scalar()
    result = await db.execute(query.order_by(Component.id).offset(offset).limit(size))
    components = result.scalars().all()

    return {
        "code": 200,
        "data": {"records": components, "total": total, "page": page, "size": size},
    }


@router.get("/built-in")
async def list_built_in_components():
    """返回所有内置控件（注册在引擎中的）"""
    comps = get_all_components()
    return {
        "code": 200,
        "data": [
            {
                "name": c.component_name,
                "display_name": c.display_name,
                "type": c.component_type,
                "config_schema": c.get_config_schema(),
            }
            for c in comps
        ],
    }


@router.get("/{component_id}")
async def get_component(component_id: int, db: AsyncSession = Depends(get_db)):
    comp = await db.get(Component, component_id)
    if not comp:
        raise HTTPException(404, "控件不存在")
    return {"code": 200, "data": comp}


@router.post("")
async def create_component(data: ComponentCreate, db: AsyncSession = Depends(get_db)):
    comp = Component(**data.model_dump())
    db.add(comp)
    await db.commit()
    await db.refresh(comp)
    return {"code": 200, "data": comp}


@router.put("/{component_id}")
async def update_component(component_id: int, data: ComponentUpdate, db: AsyncSession = Depends(get_db)):
    comp = await db.get(Component, component_id)
    if not comp:
        raise HTTPException(404, "控件不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(comp, k, v)
    await db.commit()
    return {"code": 200, "data": comp}


@router.delete("/{component_id}")
async def delete_component(component_id: int, db: AsyncSession = Depends(get_db)):
    comp = await db.get(Component, component_id)
    if not comp:
        raise HTTPException(404, "控件不存在")
    await db.delete(comp)
    await db.commit()
    return {"code": 200, "message": "删除成功"}
