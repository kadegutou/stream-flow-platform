"""CSV 输出控件"""

from typing import Optional
import polars as pl
from ...engine.component_base import BaseComponent, register_component


@register_component
class CSVOutputComponent(BaseComponent):
    component_type = "output"
    component_name = "csv-output"
    display_name = "CSV 输出"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        data = inputs.get("data", []) if inputs else []
        path = config.get("path", "output.csv")

        df = pl.DataFrame(data)
        df.write_csv(path)

        return {"path": path, "rows": df.height}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "title": "输出路径"},
            },
            "required": ["path"],
        }
