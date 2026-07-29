package com.sp.platform.components.process;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

class FieldMapProcessorTest {

    @Test
    void renameAndSelect() {
        FieldMapProcessor p = new FieldMapProcessor();
        p.open(Map.of("mapping", List.of("a:x", "b")), Context.single());
        Row out = p.process(List.of(row(Map.of("a", "1", "b", "2", "c", "3")))).get(0);
        assertEquals(Map.of("x", "1", "b", "2"), out.fields()); // c 被过滤，a 改名
    }

    @Test
    void emptyMappingPassThrough() {
        FieldMapProcessor p = new FieldMapProcessor();
        p.open(Map.of("dropFields", List.of("c")), Context.single());
        Row out = p.process(List.of(row(Map.of("a", "1", "c", "3")))).get(0);
        assertEquals(Map.of("a", "1"), out.fields());
    }

    @Test
    void parseMappingValidation() {
        assertThrows(IllegalArgumentException.class,
                () -> FieldMapProcessor.parseMapping(List.of(":b")));
        assertEquals(Map.of("a", "a"), FieldMapProcessor.parseMapping(List.of("a")));
    }

    @Test
    void dropFieldsAppliedAfterMapping() {
        Row out = FieldMapProcessor.apply(row(Map.of("a", "1", "b", "2")),
                Map.of(), List.of("b"));
        assertFalse(out.fields().containsKey("b"));
    }

    private static Row row(Map<String, String> fields) {
        return new Row(new LinkedHashMap<>(fields));
    }
}
