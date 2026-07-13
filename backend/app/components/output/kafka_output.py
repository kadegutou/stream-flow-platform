"""Kafka 输出控件"""

from typing import Optional
from ...engine.component_base import BaseComponent, register_component


@register_component
class KafkaOutputComponent(BaseComponent):
    component_type = "output"
    component_name = "kafka-output"
    display_name = "Kafka 输出"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        # TODO: 实现 Kafka 生产逻辑
        topic = config.get("topic", "")
        data = inputs.get("data", []) if inputs else []

        return {"topic": topic, "rows": len(data)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "bootstrap_servers": {"type": "string", "title": "Kafka 地址", "default": "localhost:9092"},
                "topic": {"type": "string", "title": "Topic"},
            },
            "required": ["bootstrap_servers", "topic"],
        }
