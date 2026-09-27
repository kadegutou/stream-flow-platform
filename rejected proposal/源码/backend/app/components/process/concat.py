"""字段拼接控件 (A + B → C)

默认纯 Python 实现（Python 3.14 下 100 万行约 0.7s）。
可选 C++ 加速: 配置 use_cpp=true 且 backend/ 下存在 cpp_components 模块时启用。
实测说明: pybind11 跨界传递百万行字符串的开销大于拼接计算本身，
C++ 路径仅在内核计算密集型场景有优势，本控件默认不启用。
"""

from typing import Optional
from ...engine.component_base import BaseComponent, register_component

# 可选的 C++ 加速模块（backend/cpp 构建后可用，未构建时自动回退纯 Python）
try:
    import cpp_components  # type: ignore
    _CPP_AVAILABLE = True
except ImportError:
    cpp_components = None
    _CPP_AVAILABLE = False


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

        if not isinstance(data, list) or not data:
            return {"data": data, "rows": 0}
        if not isinstance(data[0], dict):
            raise RuntimeError("字段拼接要求上游为行式数据（list[dict]）")

        # C++ 加速需显式开启（默认纯 Python，见模块 docstring 的实测说明）
        if _CPP_AVAILABLE and config.get("use_cpp"):
            return self._execute_cpp(data, field_a, field_b, field_c)

        result = []
        for row in data:
            new_row = dict(row)
            new_row[field_c] = str(row.get(field_a, "")) + str(row.get(field_b, ""))
            result.append(new_row)

        return {"data": result, "rows": len(result)}

    def _execute_cpp(self, data: list[dict], field_a: str, field_b: str, field_c: str) -> dict:
        """C++ 路径: dict 行 → 字符串矩阵 → C++ 拼接 → 还原"""
        columns = list(data[0].keys())
        idx_a = columns.index(field_a) if field_a in columns else -1
        idx_b = columns.index(field_b) if field_b in columns else -1

        matrix = [
            ["" if v is None else str(v) for v in row.values()]
            for row in data
        ]
        merged = cpp_components.concat_fields(matrix, idx_a, idx_b, field_c)

        new_columns = columns + [field_c]
        result = [dict(zip(new_columns, row)) for row in merged]
        return {"data": result, "rows": len(result)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "field_a": {"type": "string", "title": "字段 A", "default": "A"},
                "field_b": {"type": "string", "title": "字段 B", "default": "B"},
                "field_c": {"type": "string", "title": "新字段 C", "default": "C"},
                "use_cpp": {"type": "boolean", "title": "启用 C++ 加速（实验）", "default": False},
            },
            "required": ["field_a", "field_b", "field_c"],
        }
