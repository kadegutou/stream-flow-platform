"""数据库连接 — 开发用 SQLite，生产用 MySQL"""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from .config import settings

# SQLite 需要特殊参数
connect_args = {}
engine_kwargs = {"echo": False}
if settings.db_type == "sqlite":
    connect_args = {"check_same_thread": False}
    # SQLite(aiosqlite) 使用 NullPool，不接受 pool_size / pool_pre_ping
    engine_kwargs["connect_args"] = connect_args
else:
    engine_kwargs.update(pool_size=10, pool_pre_ping=True, connect_args=connect_args)

engine = create_async_engine(settings.db_url, **engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session


async def init_db():
    """初始化数据库表"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
