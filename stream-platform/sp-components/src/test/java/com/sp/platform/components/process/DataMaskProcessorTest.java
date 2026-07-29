package com.sp.platform.components.process;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DataMaskProcessorTest {

    @Test
    void maskMiddlePhone() {
        assertEquals("138****1234", DataMaskProcessor.mask("13812341234", "mask-middle"));
        assertEquals("***", DataMaskProcessor.mask("13812341234", "hide"));
        assertEquals("a**", DataMaskProcessor.mask("abc", "mask-middle"));
        assertEquals("*", DataMaskProcessor.mask("x", "mask-middle"));
    }

    @Test
    void hashIsSha256() {
        // "abc" 的 SHA-256 是公开已知值
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                DataMaskProcessor.mask("abc", "hash"));
    }

    @Test
    void parseRulesValidation() {
        assertEquals(Map.of("phone", "mask-middle"),
                DataMaskProcessor.parseRules(List.of("phone:mask-middle")));
        assertThrows(IllegalArgumentException.class,
                () -> DataMaskProcessor.parseRules(List.of("phone:unknown")));
        assertThrows(IllegalArgumentException.class,
                () -> DataMaskProcessor.parseRules(List.of("no-colon")));
    }

    @Test
    void processAppliesRulesAndKeepsOthers() {
        DataMaskProcessor p = new DataMaskProcessor();
        p.open(Map.of("rules", List.of("phone:mask-middle", "secret:hide")), Context.single());
        Row out = p.process(List.of(new Row(new LinkedHashMap<>(
                Map.of("phone", "13812341234", "secret", "s3", "name", "张三"))))).get(0);
        assertEquals("138****1234", out.getString("phone"));
        assertEquals("***", out.getString("secret"));
        assertEquals("张三", out.getString("name")); // 未配置字段不动
    }

    @Test
    void nullFieldSkipped() {
        DataMaskProcessor p = new DataMaskProcessor();
        p.open(Map.of("rules", List.of("phone:hash")), Context.single());
        Row row = new Row(new LinkedHashMap<>());
        Row out = p.process(List.of(row)).get(0);
        assertTrue(out.fields().isEmpty());
    }
}
