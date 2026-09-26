"""CSV 输入控件 (Polars)"""

from typing import Optional
import polars as pl
from ...engine.component_base import BaseComponent, register_component

# 前端可填的编码 → Polars 支持的值
_ENCODING_MAP = {
    "utf-8": "utf8",
    "utf8": "utf8",
    "utf8-lossy": "utf8-lossy",
    "utf-8-lossy": "utf8-lossy",
}


@register_component
class CSVInputComponent(BaseComponent):
    component_type = "input"
    component_name = "csv-input"
    display_name = "CSV 输入"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        path = config.get("path", "")
        separator = config.get("separator", ",")
        encoding = _ENCODING_MAP.get(str(config.get("encoding", "utf-8")).lower())
        if encoding is None:
            raise ValueError(
                f"Polars 仅支持 utf-8 / utf8-lossy 编码，收到: {config.get('encoding')}"
            )

        df = pl.read_csv(path, separator=separator, encoding=encoding)
        return {
            "data": df.to_dicts(),  # 统一行式: list[dict]
            "columns": df.columns,
            "rows": df.height,
        }

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "title": "文件路径"},
                "separator": {"type": "string", "title": "分隔符", "default": ","},
                "encoding": {
                    "type": "string",
                    "title": "编码",
                    "default": "utf-8",
                    "enum": ["utf-8", "utf8-lossy"],
                },
            },
            "required": ["path"],
        }
