package com.sp.platform.components.process;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** json-to-xml 控件测试（赛题基础验收目标）。 */
class JsonToXmlProcessorTest {

    @Test
    void shouldConvertJsonFieldToXml() throws Exception {
        JsonToXmlProcessor p = new JsonToXmlProcessor();
        p.open(Map.of("field", "json", "targetField", "xml"), Context.single());

        Map<String, Object> f = new LinkedHashMap<>();
        f.put("json", "{\"name\":\"Alice\",\"age\":30}");
        List<Row> out = p.process(List.of(new Row(f)));

        String xml = out.get(0).getString("xml");
        assertTrue(xml.contains("Alice"));
        assertTrue(xml.contains("30"));
        // 原字段保留
        assertTrue(out.get(0).getString("json").contains("Alice"));
    }

    @Test
    void shouldSkipRowWhenFieldMissing() throws Exception {
        JsonToXmlProcessor p = new JsonToXmlProcessor();
        p.open(Map.of("field", "json", "targetField", "xml"), Context.single());

        Map<String, Object> f = new LinkedHashMap<>();
        f.put("other", "x");
        List<Row> out = p.process(List.of(new Row(f)));

        assertNull(out.get(0).getString("xml"));
    }

    @Test
    void shouldFailFastOnMissingRequiredParam() {
        JsonToXmlProcessor p = new JsonToXmlProcessor();
        assertThrows(IllegalArgumentException.class,
                () -> p.open(Map.of("targetField", "xml"), Context.single()));
    }
}
