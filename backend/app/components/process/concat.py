"""字段拼接控件 (A + B → C)"""

from typing import Optional
from ...engine.component_base import BaseComponent, register_component


@register_component
class ConcatComponent(BaseComponent):
    component_type = "process"
    component_name = "concat"
    display_name = "字段拼接"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        data = inputs.get("data", []) if inputs else []
        field_a = config.get("field_a", "A")
        field_b = config.get("field_b", "B")
        field_c = config.get("field_c", "C")

        result = []
        if isinstance(data, dict):
            # 列式 { "A": [1,2], "B": [3,4] }
            col_a = data.get(field_a, [])
            col_b = data.get(field_b, [])
            result = {**data, field_c: [str(a) + str(b) for a, b in zip(col_a, col_b)]}
        elif isinstance(data, list):
            # 行式 [{"A":1,"B":3}, ...]
            for row in data:
                new_row = dict(row)
                new_row[field_c] = str(row.get(field_a, "")) + str(row.get(field_b, ""))
                result.append(new_row)

        return {"data": result, "rows": len(result) if isinstance(result, list) else len(result.get(field_c, []))}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "field_a": {"type": "string", "title": "字段 A", "default": "A"},
                "field_b": {"type": "string", "title": "字段 B", "default": "B"},
                "field_c": {"type": "string", "title": "新字段 C", "default": "C"},
            },
            "required": ["field_a", "field_b", "field_c"],
        }
