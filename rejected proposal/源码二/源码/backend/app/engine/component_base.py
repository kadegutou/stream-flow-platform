"""控件基类"""

from abc import ABC, abstractmethod
from typing import Any, Optional


class BaseComponent(ABC):
    """所有控件的抽象基类"""

    component_type: str = ""        # "input" | "process" | "output"
    component_name: str = ""        # 唯一标识, 如 "csv-input"
    display_name: str = ""          # 显示名称, 如 "CSV 输入"

    @abstractmethod
    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        """
        执行控件逻辑
        Args:
            config: 控件配置参数
            inputs: 上游控件传入的数据 (输入控件为 None)
        Returns:
            {"data": ..., "rows": 123}
        """
        ...

    @abstractmethod
    def get_config_schema(self) -> dict:
        """返回控件的 JSON Schema，前端据此动态渲染配置表单"""
        ...


# 全局控件注册表
_component_registry: dict[str, BaseComponent] = {}


def register_component(cls: type) -> type:
    """装饰器：注册控件到全局表"""
    instance = cls()
    _component_registry[instance.component_name] = instance
    return cls


def get_component(name: str) -> Optional[BaseComponent]:
    """根据名称获取控件实例"""
    return _component_registry.get(name)


def get_all_components() -> list[BaseComponent]:
    """获取所有已注册控件"""
    return list(_component_registry.values())
