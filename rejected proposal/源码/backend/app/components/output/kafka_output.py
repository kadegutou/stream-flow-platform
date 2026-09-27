"""Kafka 输出控件 — 把行式数据逐条发送到 Topic"""

import asyncio
import json
from typing import Optional
from ...engine.component_base import BaseComponent, register_component


@register_component
class KafkaOutputComponent(BaseComponent):
    component_type = "output"
    component_name = "kafka-output"
    display_name = "Kafka 输出"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        try:
            from confluent_kafka import Producer
        except ImportError:
            raise RuntimeError("未安装 confluent-kafka，Kafka 控件不可用")

        servers = config.get("bootstrap_servers", "localhost:9092")
        topic = config.get("topic", "")
        data = inputs.get("data", []) if inputs else []

        if not topic:
            raise ValueError("Topic 不能为空")

        producer = Producer({"bootstrap.servers": servers})

        def _produce_all():
            for row in data:
                payload = row if isinstance(row, str) else json.dumps(row, ensure_ascii=False)
                producer.produce(topic, payload.encode("utf-8"))
                producer.poll(0)
            producer.flush(10)

        await asyncio.to_thread(_produce_all)

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
