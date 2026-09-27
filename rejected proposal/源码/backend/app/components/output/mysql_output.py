"""MySQL 输出控件 — 默认写平台库，可配置 url 连接外部 MySQL"""

import re
from typing import Optional
from sqlalchemy import text
from ...engine.component_base import BaseComponent, register_component
from ..input.mysql_input import _session

# 表名白名单字符，防 SQL 注入
_TABLE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")


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
        if not _TABLE_RE.match(table):
            raise ValueError(f"非法表名: {table}")
        if not isinstance(data[0], dict):
            raise RuntimeError("MySQL 输出要求上游为行式数据（list[dict]）")

        columns = list(data[0].keys())
        cols_str = ",".join(f"`{c}`" for c in columns)
        values_str = ",".join(f":{c}" for c in columns)
        insert_sql = f"INSERT INTO {table} ({cols_str}) VALUES ({values_str})"

        async with _session(config.get("url", "")) as db:
            # executemany 风格批量插入
            await db.execute(text(insert_sql), data)
            await db.commit()

        return {"rows": len(data)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "table": {"type": "string", "title": "目标表名"},
                "url": {
                    "type": "string",
                    "title": "外部数据库 URL（留空=平台库）",
                    "default": "",
                },
            },
            "required": ["table"],
        }
