"""Kafka 输入控件"""

from typing import Optional
from ...engine.component_base import BaseComponent, register_component


@register_component
class KafkaInputComponent(BaseComponent):
    component_type = "input"
    component_name = "kafka-input"
    display_name = "Kafka 输入"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        # TODO: 实现 Kafka 消费逻辑
        topic = config.get("topic", "")
        group_id = config.get("group_id", "bangsheng")

        # stub 返回
        return {"data": [], "rows": 0, "topic": topic}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "bootstrap_servers": {"type": "string", "title": "Kafka 地址", "default": "localhost:9092"},
                "topic": {"type": "string", "title": "Topic"},
                "group_id": {"type": "string", "title": "消费组", "default": "bangsheng"},
            },
            "required": ["bootstrap_servers", "topic"],
        }
