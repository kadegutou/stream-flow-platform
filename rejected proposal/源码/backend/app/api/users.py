"""用户管理 API"""

import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr

from ..database import get_db
from ..models.user import User

router = APIRouter(prefix="/api/users", tags=["用户管理"])


def hash_password(raw: str) -> str:
    """演示级密码哈希（生产建议换 passlib/bcrypt）"""
    return hashlib.sha256(f"bangsheng:{raw}".encode("utf-8")).hexdigest()


class UserCreate(BaseModel):
    username: str
    password: str
    email: EmailStr | None = None
    role: str = "user"


class UserUpdate(BaseModel):
    username: str | None = None
    password: str | None = None
    email: EmailStr | None = None
    role: str | None = None


class UserOut(BaseModel):
    """响应模型 — 绝不包含 password 字段"""
    id: int
    username: str
    email: str | None
    role: str
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


def _page(records, total, page, size):
    return {
        "code": 200,
        "data": {
            "records": [UserOut.model_validate(u) for u in records],
            "total": total,
            "page": page,
            "size": size,
        },
    }


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
    return _page(result.scalars().all(), total, page, size)


@router.get("/{user_id}")
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    return {"code": 200, "data": UserOut.model_validate(user)}


@router.post("")
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db)):
    payload = data.model_dump()
    payload["password"] = hash_password(payload["password"])
    user = User(**payload)
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, f"用户名 '{data.username}' 已存在")
    await db.refresh(user)
    return {"code": 200, "data": UserOut.model_validate(user)}


@router.put("/{user_id}")
async def update_user(user_id: int, data: UserUpdate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == "password":
            v = hash_password(v)
        setattr(user, k, v)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "用户名已被占用")
    return {"code": 200, "data": UserOut.model_validate(user)}


@router.delete("/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    await db.delete(user)
    await db.commit()
    return {"code": 200, "message": "删除成功"}
