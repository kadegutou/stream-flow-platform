package com.sp.platform.components.redis;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Processor;
import com.sp.platform.components.Params;
import io.lettuce.core.LettuceFutures;
import io.lettuce.core.api.async.RedisAsyncCommands;
import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisFuture;
import io.lettuce.core.RedisURI;
import io.lettuce.core.api.StatefulRedisConnection;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Redis 字段补数控件（设计文档 §5.3 挑战项）：
 * 按记录中 keyField 字段的值查 Redis，把结果扩充为记录的新字段。
 *
 * <ul>
 *   <li>fields 模式：HGETALL keyPrefix+keyValue，按 fieldMapping（redisField:newName）
 *       扩充字段；mapping 为空则全部 field 按原名扩充；</li>
 *   <li>json 模式：GET keyPrefix+keyValue，把 string 值原样放入 targetField；</li>
 *   <li>查不到时记录原样通过（不报错）；</li>
 *   <li>按批 pipeline 批量查询，避免逐行 RTT；本地缓存（cacheSize）降低 Redis 压力。</li>
 * </ul>
 */
@ComponentDef(
        code = "redis-enrich",
        name = "Redis 字段补数",
        category = "PROCESS",
        description = "按某字段值查 Redis（hash/string），把结果扩充为记录新字段；批量 pipeline 查询 + 本地缓存",
        icon = "redis",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["keyField"],
                  "properties": {
                    "host":         {"type": "string",  "title": "Redis 主机", "default": "localhost"},
                    "port":         {"type": "integer", "title": "端口", "default": 6379},
                    "password":     {"type": "string",  "title": "密码(可选)"},
                    "database":     {"type": "integer", "title": "库号", "default": 0},
                    "keyField":     {"type": "string",  "title": "作为 key 的字段名"},
                    "keyPrefix":    {"type": "string",  "title": "key 前缀", "default": ""},
                    "resultType":   {"type": "string",  "title": "结果类型", "enum": ["fields", "json"], "default": "fields"},
                    "fieldMapping": {"type": "array",   "title": "fields模式字段映射 redisField:newName(空=全部原名)", "items": {"type": "string"}},
                    "targetField":  {"type": "string",  "title": "json模式目标字段"},
                    "cacheSize":    {"type": "integer", "title": "本地缓存条数(0关闭)", "default": 10000}
                  }
                }
                """)
public class RedisEnrichProcessor implements Processor {

    /** 缓存中的「未命中」标记。 */
    private static final Object MISS = new Object();

    private RedisClient client;
    private StatefulRedisConnection<String, String> conn;

    private String keyField;
    private String keyPrefix;
    private boolean jsonMode;
    private String targetField;
    private Map<String, String> fieldMapping; // redisField -> newName；空 = 全部原名
    private int cacheSize;
    private Map<String, Object> cache;

    @Override
    public void open(Map<String, Object> params, Context ctx) {
        String host = Params.str(params, "host", "localhost");
        int port = Params.integer(params, "port", 6379);
        String password = Params.str(params, "password", "");
        int database = Params.integer(params, "database", 0);
        this.keyField = Params.required(params, "keyField");
        this.keyPrefix = Params.str(params, "keyPrefix", "");
        this.jsonMode = "json".equals(Params.str(params, "resultType", "fields"));
        this.targetField = Params.str(params, "targetField", null);
        this.fieldMapping = parseFieldMapping(strListOrEmpty(params, "fieldMapping"));
        this.cacheSize = Params.integer(params, "cacheSize", 10000);
        this.cache = cacheSize > 0 ? new ConcurrentHashMap<>() : null;

        RedisURI.Builder uri = RedisURI.builder().withHost(host).withPort(port)
                .withDatabase(database).withTimeout(Duration.ofSeconds(10));
        if (!password.isBlank()) {
            uri.withPassword(password.toCharArray());
        }
        client = RedisClient.create(uri.build());
        conn = client.connect();
    }

    @Override
    public List<Row> process(List<Row> batch) throws Exception {
        // 1. 解析每行 key；缓存命中的直接用，未命中的收集起来 pipeline 批量查
        Map<String, Object> resolved = new LinkedHashMap<>(); // 本批 key → 结果（null=未命中）
        Map<String, RedisFuture<?>> futures = new LinkedHashMap<>();
        RedisAsyncCommands<String, String> async = conn.async();
        async.setAutoFlushCommands(false);
        for (Row row : batch) {
            String key = redisKey(row);
            if (key == null || resolved.containsKey(key)) {
                continue; // keyField 无值：原样通过；同批同 key 只查一次
            }
            if (cache != null && cache.containsKey(key)) {
                resolved.put(key, unwrap(cache.get(key)));
            } else {
                futures.put(key, jsonMode ? async.get(key) : async.hgetall(key));
                resolved.put(key, null); // 占位，pipeline 返回后填充
            }
        }
        if (!futures.isEmpty()) {
            conn.flushCommands();
            LettuceFutures.awaitAll(30, TimeUnit.SECONDS,
                    futures.values().toArray(new RedisFuture<?>[0]));
            for (Map.Entry<String, RedisFuture<?>> e : futures.entrySet()) {
                Object value = readFuture(e.getValue());
                resolved.put(e.getKey(), value);
                if (cache != null && cache.size() < cacheSize) {
                    cache.put(e.getKey(), value == null ? MISS : value);
                }
            }
        }

        // 2. 应用查询/缓存结果
        List<Row> out = new ArrayList<>(batch.size());
        for (Row row : batch) {
            String key = redisKey(row);
            out.add(key == null ? row : apply(row, resolved.get(key)));
        }
        return out;
    }

    private static Object unwrap(Object cached) {
        return cached == MISS ? null : cached;
    }

    private String redisKey(Row row) {
        Object v = row.fields().get(keyField);
        return v == null ? null : keyPrefix + v;
    }

    @SuppressWarnings("unchecked")
    private Object readFuture(RedisFuture<?> future) {
        try {
            Object v = future.get(30, TimeUnit.SECONDS);
            if (v instanceof Map<?, ?> m && m.isEmpty()) {
                return null; // HGETALL 未命中返回空 map
            }
            return v instanceof Map ? (Map<String, String>) v : v;
        } catch (Exception e) {
            return null;
        }
    }

    /** 把查询结果应用到记录上；未命中（null）原样通过。 */
    @SuppressWarnings("unchecked")
    private Row apply(Row row, Object value) {
        if (value == null) {
            return row;
        }
        if (jsonMode) {
            return applyJson(row, (String) value, targetField);
        }
        return applyFields(row, (Map<String, String>) value, fieldMapping);
    }

    /** fields 模式：hash field 按 mapping 扩充为新字段（mapping 为空则全部原名）。 */
    static Row applyFields(Row row, Map<String, String> hash, Map<String, String> mapping) {
        Map<String, Object> fields = new LinkedHashMap<>(row.fields());
        if (mapping.isEmpty()) {
            fields.putAll(hash);
        } else {
            for (Map.Entry<String, String> e : mapping.entrySet()) {
                String v = hash.get(e.getKey());
                if (v != null) {
                    fields.put(e.getValue(), v);
                }
            }
        }
        return new Row(fields);
    }

    /** json 模式：string 值原样放入 targetField。 */
    static Row applyJson(Row row, String value, String targetField) {
        if (targetField == null || targetField.isBlank()) {
            throw new IllegalStateException("json 模式必须配置 targetField");
        }
        Map<String, Object> fields = new LinkedHashMap<>(row.fields());
        fields.put(targetField, value);
        return new Row(fields);
    }

    /** 解析 fieldMapping："redisField:newName" 数组 → 有序映射。非法项抛异常（参数错误应尽早暴露）。 */
    static Map<String, String> parseFieldMapping(List<String> items) {
        Map<String, String> mapping = new LinkedHashMap<>();
        for (String item : items) {
            int idx = item.indexOf(':');
            if (idx <= 0 || idx == item.length() - 1) {
                throw new IllegalArgumentException(
                        "fieldMapping 格式应为 redisField:newName: " + item);
            }
            mapping.put(item.substring(0, idx), item.substring(idx + 1));
        }
        return mapping;
    }

    private static List<String> strListOrEmpty(Map<String, Object> params, String key) {
        Object v = params.get(key);
        if (v == null) {
            return List.of();
        }
        return Params.strList(params, key);
    }

    public void close() {
        if (conn != null) {
            conn.close();
        }
        if (client != null) {
            client.shutdown();
        }
    }
}
