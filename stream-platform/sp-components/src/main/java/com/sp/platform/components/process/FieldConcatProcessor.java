package com.sp.platform.components.process;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Processor;
import com.sp.platform.components.Params;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 字段拼接控件：把多个字段拼接为新字段（A+B→C）。 */
@ComponentDef(
        code = "field-concat",
        name = "字段拼接",
        category = "PROCESS",
        description = "将多个字段按分隔符拼接为新字段",
        icon = "merge-cells",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["sourceFields", "targetField"],
                  "properties": {
                    "sourceFields": {"type": "array", "title": "源字段列表", "items": {"type": "string"}},
                    "targetField":  {"type": "string", "title": "目标字段"},
                    "separator":    {"type": "string", "title": "分隔符", "default": ""}
                  }
                }
                """)
public class FieldConcatProcessor implements Processor {

    private List<String> sourceFields;
    private String targetField;
    private String separator;

    @Override
    public void open(Map<String, Object> params, Context ctx) {
        this.sourceFields = Params.strList(params, "sourceFields");
        this.targetField = Params.required(params, "targetField");
        this.separator = Params.str(params, "separator", "");
    }

    @Override
    public List<Row> process(List<Row> batch) {
        List<Row> out = new ArrayList<>(batch.size());
        for (Row row : batch) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < sourceFields.size(); i++) {
                if (i > 0) {
                    sb.append(separator);
                }
                Object v = row.fields().get(sourceFields.get(i));
                if (v != null) {
                    sb.append(v);
                }
            }
            Map<String, Object> fields = new LinkedHashMap<>(row.fields());
            fields.put(targetField, sb.toString());
            out.add(new Row(fields));
        }
        return out;
    }
}
