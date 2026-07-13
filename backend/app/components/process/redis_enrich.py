"""Redis 字段扩充控件 — 根据字段 A 查 Redis 补充数据"""

from typing import Optional
import json
from redis.asyncio import Redis
from ...engine.component_base import BaseComponent, register_component
from ...config import settings


@register_component
class RedisEnrichComponent(BaseComponent):
    component_type = "process"
    component_name = "redis-enrich"
    display_name = "Redis 字段扩充"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        data = inputs.get("data", []) if inputs else []
        key_field = config.get("key_field", "id")
        value_fields = config.get("value_fields", [])  # 从 Redis 取哪些字段

        redis = Redis.from_url(settings.redis_url, decode_responses=True)

        result = []
        for row in data:
            new_row = dict(row)
            key = str(row.get(key_field, ""))
            if key:
                cached = await redis.get(key)
                if cached:
                    cached_data = json.loads(cached)
                    for vf in value_fields:
                        new_row[vf] = cached_data.get(vf, "")
            result.append(new_row)

        return {"data": result, "rows": len(result)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "key_field": {"type": "string", "title": "关联字段", "default": "id"},
                "value_fields": {"type": "array", "items": {"type": "string"}, "title": "扩充字段列表"},
            },
            "required": ["key_field"],
        }
