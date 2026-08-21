package com.sp.platform.components.process;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** xml-to-json 控件测试（赛题基础验收目标）。 */
class XmlToJsonProcessorTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void shouldConvertXmlFieldToJson() throws Exception {
        XmlToJsonProcessor p = new XmlToJsonProcessor();
        p.open(Map.of("field", "xml", "targetField", "json"), Context.single());

        Map<String, Object> f = new LinkedHashMap<>();
        f.put("xml", "<person><name>Alice</name><age>30</age></person>");
        List<Row> out = p.process(List.of(new Row(f)));

        String json = out.get(0).getString("json");
        // 验证是合法 JSON 且包含 XML 中的值（Jackson XML 对根元素有拆解/包裹两种行为，不假设具体结构）
        JsonNode node = mapper.readTree(json);
        assertEquals("Alice", node.findValue("name").asText());
        // 原字段保留
        assertEquals("<person><name>Alice</name><age>30</age></person>", out.get(0).getString("xml"));
    }

    @Test
    void shouldSkipRowWhenFieldMissing() throws Exception {
        XmlToJsonProcessor p = new XmlToJsonProcessor();
        p.open(Map.of("field", "xml", "targetField", "json"), Context.single());

        Map<String, Object> f = new LinkedHashMap<>();
        f.put("other", "x");
        List<Row> out = p.process(List.of(new Row(f)));

        assertNull(out.get(0).getString("json"));
    }

    @Test
    void shouldFailFastOnMissingRequiredParam() {
        XmlToJsonProcessor p = new XmlToJsonProcessor();
        assertThrows(IllegalArgumentException.class,
                () -> p.open(Map.of("field", "xml"), Context.single()));
    }
}
