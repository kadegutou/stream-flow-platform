"""MySQL 输入控件 — 默认读平台库，可配置 url 连接外部 MySQL"""

from typing import Optional
from contextlib import asynccontextmanager
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from ...engine.component_base import BaseComponent, register_component
from ...database import async_session


@asynccontextmanager
async def _session(url: str = ""):
    """有 url 用外部库，否则用平台业务库"""
    if url:
        engine = create_async_engine(url)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with session_factory() as s:
                yield s
        finally:
            await engine.dispose()
    else:
        async with async_session() as s:
            yield s


@register_component
class MySQLInputComponent(BaseComponent):
    component_type = "input"
    component_name = "mysql-input"
    display_name = "MySQL 输入"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        query_sql = config.get("query", "")
        if not query_sql.strip():
            raise ValueError("查询 SQL 不能为空")

        async with _session(config.get("url", "")) as db:
            result = await db.execute(text(query_sql))
            rows = [dict(row._mapping) for row in result.fetchall()]

        return {"data": rows, "rows": len(rows)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "title": "查询 SQL"},
                "url": {
                    "type": "string",
                    "title": "外部数据库 URL（留空=平台库）",
                    "default": "",
                },
            },
            "required": ["query"],
        }
