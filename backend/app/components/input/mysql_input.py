"""MySQL 输入控件"""

from typing import Optional
from sqlalchemy import text
from ...engine.component_base import BaseComponent, register_component
from ...database import async_session


@register_component
class MySQLInputComponent(BaseComponent):
    component_type = "input"
    component_name = "mysql-input"
    display_name = "MySQL 输入"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        query_sql = config.get("query", "SELECT 1")

        async with async_session() as db:
            result = await db.execute(text(query_sql))
            rows = [dict(row._mapping) for row in result.fetchall()]

        return {"data": rows, "rows": len(rows)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "title": "查询 SQL"},
            },
            "required": ["query"],
        }
