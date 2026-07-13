"""用户管理 API"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr

from ..database import get_db
from ..models.user import User

router = APIRouter(prefix="/api/users", tags=["用户管理"])


class UserCreate(BaseModel):
    username: str
    password: str
    email: EmailStr | None = None
    role: str = "user"


class UserUpdate(BaseModel):
    username: str | None = None
    email: str | None = None
    role: str | None = None


class UserOut(BaseModel):
    id: int
    username: str
    email: str | None
    role: str
    created_at: str | None

    model_config = {"from_attributes": True}


@router.get("")
async def list_users(
    page: int = 1,
    size: int = 10,
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size
    total = (await db.execute(select(func.count(User.id)))).scalar()
    result = await db.execute(
        select(User).order_by(User.id.desc()).offset(offset).limit(size)
    )
    users = result.scalars().all()
    return {
        "code": 200,
        "data": {"records": users, "total": total, "page": page, "size": size},
    }


@router.get("/{user_id}")
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    return {"code": 200, "data": user}


@router.post("")
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db)):
    user = User(**data.model_dump())
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"code": 200, "data": user}


@router.put("/{user_id}")
async def update_user(user_id: int, data: UserUpdate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    await db.commit()
    return {"code": 200, "data": user}


@router.delete("/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    await db.delete(user)
    await db.commit()
    return {"code": 200, "message": "删除成功"}
