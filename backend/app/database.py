"""数据库连接 — 开发用 SQLite，生产用 MySQL"""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from .config import settings

# SQLite 需要特殊参数
connect_args = {}
pool_size = 10
if settings.db_type == "sqlite":
    connect_args = {"check_same_thread": False}
    pool_size = 1  # SQLite 不支持连接池

engine = create_async_engine(
    settings.db_url,
    echo=False,
    pool_size=pool_size,
    connect_args=connect_args,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """初始化数据库表"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
