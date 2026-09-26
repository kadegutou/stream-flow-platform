"""Excel 输出控件"""

from typing import Optional
import openpyxl
from ...engine.component_base import BaseComponent, register_component


@register_component
class ExcelOutputComponent(BaseComponent):
    component_type = "output"
    component_name = "excel-output"
    display_name = "Excel 输出"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        data = inputs.get("data", []) if inputs else []
        path = config.get("path", "output.xlsx")

        wb = openpyxl.Workbook()
        ws = wb.active

        if data and isinstance(data[0], dict):
            # 行式字典: 写表头 + 数据行
            header = list(data[0].keys())
            ws.append(header)
            for row in data:
                ws.append([row.get(h) for h in header])
        else:
            for row in data:
                ws.append(row if isinstance(row, list) else [row])

        wb.save(path)

        return {"path": path, "rows": len(data)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "title": "输出路径"},
            },
            "required": ["path"],
        }
