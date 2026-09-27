"""Kafka 输入控件 — 有界消费一批消息"""

import asyncio
from typing import Optional
from ...engine.component_base import BaseComponent, register_component


@register_component
class KafkaInputComponent(BaseComponent):
    component_type = "input"
    component_name = "kafka-input"
    display_name = "Kafka 输入"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        try:
            from confluent_kafka import Consumer, KafkaException
        except ImportError:
            raise RuntimeError("未安装 confluent-kafka，Kafka 控件不可用")

        servers = config.get("bootstrap_servers", "localhost:9092")
        topic = config.get("topic", "")
        group_id = config.get("group_id", "bangsheng")
        max_messages = int(config.get("max_messages", 1000))
        timeout = float(config.get("timeout", 5))

        if not topic:
            raise ValueError("Topic 不能为空")

        consumer = Consumer({
            "bootstrap.servers": servers,
            "group.id": group_id,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": True,
        })
        consumer.subscribe([topic])

        rows: list[dict] = []
        try:
            # 在线程池中轮询，避免阻塞事件循环
            def _poll_batch():
                batch = []
                for _ in range(max_messages):
                    msg = consumer.poll(timeout=1.0)
                    if msg is None:
                        break
                    if msg.error():
                        raise KafkaException(msg.error())
                    batch.append({
                        "offset": msg.offset(),
                        "partition": msg.partition(),
                        "message": (msg.value() or b"").decode("utf-8", errors="replace"),
                    })
                return batch

            rows = await asyncio.wait_for(
                asyncio.to_thread(_poll_batch), timeout=timeout + 5
            )
        except asyncio.TimeoutError:
            pass  # 超时返回已收到的部分
        finally:
            consumer.close()

        return {"data": rows, "rows": len(rows)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "bootstrap_servers": {"type": "string", "title": "Kafka 地址", "default": "localhost:9092"},
                "topic": {"type": "string", "title": "Topic"},
                "group_id": {"type": "string", "title": "消费组", "default": "bangsheng"},
                "max_messages": {"type": "integer", "title": "单次最多消费条数", "default": 1000},
                "timeout": {"type": "number", "title": "超时时间（秒）", "default": 5},
            },
            "required": ["bootstrap_servers", "topic"],
        }
