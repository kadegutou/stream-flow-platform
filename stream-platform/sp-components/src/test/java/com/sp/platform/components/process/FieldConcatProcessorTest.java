package com.sp.platform.components.process;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** field-concat 字段拼接测试。 */
class FieldConcatProcessorTest {

    @Test
    void shouldConcatFieldsWithSeparator() throws Exception {
        FieldConcatProcessor p = new FieldConcatProcessor();
        p.open(Map.of("sourceFields", List.of("A", "B"), "targetField", "C", "separator", "-"),
                Context.single());

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("A", "foo");
        fields.put("B", "bar");
        List<Row> out = p.process(List.of(new Row(fields)));

        assertEquals(1, out.size());
        assertEquals("foo-bar", out.get(0).getString("C"));
        // 原字段保留
        assertEquals("foo", out.get(0).getString("A"));
    }

    @Test
    void shouldTreatNullAsEmptyAndDefaultSeparator() throws Exception {
        FieldConcatProcessor p = new FieldConcatProcessor();
        p.open(Map.of("sourceFields", List.of("A", "B"), "targetField", "C"), Context.single());

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("A", "x");
        fields.put("B", null);
        List<Row> out = p.process(List.of(new Row(fields)));

        assertEquals("x", out.get(0).getString("C"));
    }

    @Test
    void shouldFailFastOnMissingRequiredParam() {
        FieldConcatProcessor p = new FieldConcatProcessor();
        assertThrows(IllegalArgumentException.class,
                () -> p.open(Map.of("targetField", "C"), Context.single()));
    }
}
