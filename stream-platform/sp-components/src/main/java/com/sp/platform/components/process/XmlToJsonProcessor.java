package com.sp.platform.components.process;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Processor;
import com.sp.platform.components.Params;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** XML → JSON 转换控件（jackson-dataformat-xml）。 */
@ComponentDef(
        code = "xml-to-json",
        name = "XML 转 JSON",
        category = "PROCESS",
        description = "将指定字段的 XML 字符串解析为 JSON 字符串写入目标字段",
        icon = "swap",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["field", "targetField"],
                  "properties": {
                    "field":       {"type": "string", "title": "源字段(XML)"},
                    "targetField": {"type": "string", "title": "目标字段(JSON)"}
                  }
                }
                """)
public class XmlToJsonProcessor implements Processor {

    private final XmlMapper xmlMapper = new XmlMapper();
    private final ObjectMapper jsonMapper = new ObjectMapper();

    private String field;
    private String targetField;

    @Override
    public void open(Map<String, Object> params, Context ctx) {
        this.field = Params.required(params, "field");
        this.targetField = Params.required(params, "targetField");
    }

    @Override
    public List<Row> process(List<Row> batch) throws Exception {
        List<Row> out = new ArrayList<>(batch.size());
        for (Row row : batch) {
            Object v = row.fields().get(field);
            if (v == null) {
                out.add(row);
                continue;
            }
            JsonNode tree = xmlMapper.readTree(String.valueOf(v));
            Map<String, Object> fields = new LinkedHashMap<>(row.fields());
            fields.put(targetField, jsonMapper.writeValueAsString(tree));
            out.add(new Row(fields));
        }
        return out;
    }
}
