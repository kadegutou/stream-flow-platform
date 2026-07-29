package com.sp.platform.components.redis;

import com.sp.platform.common.Row;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** redis-enrich 的解析与应用逻辑（不连真实 Redis）。 */
class RedisEnrichProcessorTest {

    @Test
    void parseFieldMapping() {
        Map<String, String> m = RedisEnrichProcessor.parseFieldMapping(
                List.of("cust_name:name", "cust_level:level"));
        assertEquals("name", m.get("cust_name"));
        assertEquals("level", m.get("cust_level"));
        assertEquals(List.of("cust_name", "cust_level"), List.copyOf(m.keySet())); // 保序
        assertThrows(IllegalArgumentException.class,
                () -> RedisEnrichProcessor.parseFieldMapping(List.of("no-colon")));
        assertThrows(IllegalArgumentException.class,
                () -> RedisEnrichProcessor.parseFieldMapping(List.of("a:")));
    }

    @Test
    void applyFieldsWithMapping() {
        Row row = row(Map.of("id", "1"));
        Map<String, String> hash = Map.of("cust_name", "张三", "cust_level", "VIP", "other", "x");
        Row out = RedisEnrichProcessor.applyFields(row, hash,
                Map.of("cust_name", "name", "cust_level", "level"));
        assertEquals("1", out.getString("id"));
        assertEquals("张三", out.getString("name"));
        assertEquals("VIP", out.getString("level"));
        assertFalse(out.fields().containsKey("other")); // mapping 之外的 field 不扩充
    }

    @Test
    void applyFieldsWithoutMappingUsesOriginalNames() {
        Row row = row(Map.of("id", "1"));
        Row out = RedisEnrichProcessor.applyFields(row,
                Map.of("a", "1", "b", "2"), Map.of());
        assertEquals("1", out.getString("a"));
        assertEquals("2", out.getString("b"));
        assertEquals("1", out.getString("id"));
    }

    @Test
    void applyFieldsIgnoresMissingHashField() {
        Row row = row(Map.of("id", "1"));
        Row out = RedisEnrichProcessor.applyFields(row, Map.of(),
                Map.of("cust_name", "name"));
        assertFalse(out.fields().containsKey("name"));
        assertEquals("1", out.getString("id")); // 原样通过
    }

    @Test
    void applyJson() {
        Row row = row(Map.of("id", "1"));
        Row out = RedisEnrichProcessor.applyJson(row, "{\"k\":1}", "detail");
        assertEquals("{\"k\":1}", out.getString("detail"));
        assertThrows(IllegalStateException.class,
                () -> RedisEnrichProcessor.applyJson(row, "v", " "));
    }

    private static Row row(Map<String, String> fields) {
        return new Row(new LinkedHashMap<>(fields));
    }
}
