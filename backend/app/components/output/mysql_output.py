"""MySQL 输出控件"""

from typing import Optional
from sqlalchemy import text
from ...engine.component_base import BaseComponent, register_component
from ...database import async_session


@register_component
class MySQLOutputComponent(BaseComponent):
    component_type = "output"
    component_name = "mysql-output"
    display_name = "MySQL 输出"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        data = inputs.get("data", []) if inputs else []
        table = config.get("table", "")
        if not table or not data:
            return {"rows": 0}

        columns = list(data[0].keys()) if isinstance(data[0], dict) else []
        if not columns and isinstance(data[0], list):
            # 如果是二维数组，按序插入
            cols_str = ",".join([f"col_{i}" for i in range(len(data[0]))])
            values_str = ",".join([f":col_{i}" for i in range(len(data[0]))])
        else:
            cols_str = ",".join(columns)
            values_str = ",".join([f":{c}" for c in columns])

        insert_sql = f"INSERT INTO {table} ({cols_str}) VALUES ({values_str})"

        async with async_session() as db:
            for row in data:
                await db.execute(text(insert_sql), row)
            await db.commit()

        return {"rows": len(data)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "table": {"type": "string", "title": "目标表名"},
            },
            "required": ["table"],
        }
