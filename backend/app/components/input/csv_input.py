"""CSV 输入控件"""

from typing import Optional
import polars as pl
from ...engine.component_base import BaseComponent, register_component


@register_component
class CSVInputComponent(BaseComponent):
    component_type = "input"
    component_name = "csv-input"
    display_name = "CSV 输入"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        path = config.get("path", "")
        separator = config.get("separator", ",")
        encoding = config.get("encoding", "utf-8")

        df = pl.read_csv(path, separator=separator, encoding=encoding)
        return {
            "data": df.to_dict(as_series=False),
            "columns": df.columns,
            "rows": df.height,
        }

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "title": "文件路径"},
                "separator": {"type": "string", "title": "分隔符", "default": ","},
                "encoding": {"type": "string", "title": "编码", "default": "utf-8"},
            },
            "required": ["path"],
        }
