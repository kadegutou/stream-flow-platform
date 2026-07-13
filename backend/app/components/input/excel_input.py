"""Excel 输入控件"""

from typing import Optional
import openpyxl
from ...engine.component_base import BaseComponent, register_component


@register_component
class ExcelInputComponent(BaseComponent):
    component_type = "input"
    component_name = "excel-input"
    display_name = "Excel 输入"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        path = config.get("path", "")
        sheet_name = config.get("sheet")

        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb[sheet_name] if sheet_name else wb.active

        rows = [list(row) for row in ws.iter_rows(values_only=True)]
        wb.close()

        return {"data": rows, "rows": len(rows)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "title": "文件路径"},
                "sheet": {"type": "string", "title": "Sheet 名称"},
            },
            "required": ["path"],
        }
