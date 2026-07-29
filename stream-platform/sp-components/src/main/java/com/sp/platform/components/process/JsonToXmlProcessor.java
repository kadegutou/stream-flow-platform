package com.sp.platform.components.process;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Processor;
import com.sp.platform.components.Params;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** JSON → XML 转换控件（jackson-dataformat-xml）。 */
@ComponentDef(
        code = "json-to-xml",
        name = "JSON 转 XML",
        category = "PROCESS",
        description = "将指定字段的 JSON 字符串转换为 XML 字符串写入目标字段",
        icon = "swap",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["field", "targetField"],
                  "properties": {
                    "field":       {"type": "string", "title": "源字段(JSON)"},
                    "targetField": {"type": "string", "title": "目标字段(XML)"}
                  }
                }
                """)
public class JsonToXmlProcessor implements Processor {

    private final ObjectMapper jsonMapper = new ObjectMapper();
    private final XmlMapper xmlMapper = new XmlMapper();

    private String field;
    private String targetField;

    @Override
    public void open(Map<String, Object> params, Context ctx) {
        this.field = Params.required(params, "field");
        this.targetField = Params.required(params, "targetField");
    }

    @Override
    public List<Row> process(List<Row> batch) throws Exception {
        for (int i = 0; i < batch.size(); i++) {
            Row row = batch.get(i);
            Object v = row.fields().get(field);
            if (v == null) {
                continue;
            }
            JsonNode tree = jsonMapper.readTree(String.valueOf(v));
            Map<String, Object> fields = new LinkedHashMap<>(row.fields());
            fields.put(targetField, xmlMapper.writeValueAsString(tree));
            batch.set(i, new Row(fields));
        }
        return batch;
    }
}
