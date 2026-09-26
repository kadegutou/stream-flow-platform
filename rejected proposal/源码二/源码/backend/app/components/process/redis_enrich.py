"""Redis 字段扩充控件 — 根据关联字段查 Redis 补充数据"""

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
        value_fields = config.get("value_fields", [])
        # 兼容逗号分隔的字符串写法（配置面板文本输入）
        if isinstance(value_fields, str):
            value_fields = [f.strip() for f in value_fields.split(",") if f.strip()]

        redis_url = settings.redis_url or config.get("redis_url", "")
        if not redis_url:
            raise RuntimeError(
                "Redis 未配置：请设置环境变量 BS_REDIS_URL（如 redis://localhost:6379/0）"
            )
        if not isinstance(data, list):
            raise RuntimeError("Redis 扩充要求上游为行式数据（list[dict]）")

        redis = Redis.from_url(redis_url, decode_responses=True)
        try:
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
        finally:
            await redis.aclose()

        return {"data": result, "rows": len(result)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "key_field": {"type": "string", "title": "关联字段", "default": "id"},
                "value_fields": {"type": "string", "title": "扩充字段（逗号分隔）"},
                "redis_url": {"type": "string", "title": "Redis 地址", "default": "redis://localhost:6379/0"},
            },
            "required": ["key_field"],
        }
