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

/**
 * 字段映射/过滤控件：
 * mapping（"oldName:newName" 数组，空则全部原样通过）做字段选择/改名，
 * dropFields（数组）做字段剔除。
 */
@ComponentDef(
        code = "field-map",
        name = "字段映射",
        category = "PROCESS",
        description = "字段选择/改名（oldName:newName）与字段剔除",
        icon = "swap",
        paramSchema = """
                {
                  "type": "object",
                  "properties": {
                    "mapping":    {"type": "array", "title": "字段映射 oldName:newName(空=全部通过)", "items": {"type": "string"}},
                    "dropFields": {"type": "array", "title": "剔除字段", "items": {"type": "string"}}
                  }
                }
                """)
public class FieldMapProcessor implements Processor {

    private Map<String, String> mapping; // oldName -> newName；空 = 全部通过
    private List<String> dropFields = List.of();

    @Override
    public void open(Map<String, Object> params, Context ctx) {
        this.mapping = parseMapping(strListOrEmpty(params, "mapping"));
        this.dropFields = strListOrEmpty(params, "dropFields");
    }

    @Override
    public List<Row> process(List<Row> batch) {
        List<Row> out = new ArrayList<>(batch.size());
        for (Row row : batch) {
            out.add(apply(row, mapping, dropFields));
        }
        return out;
    }

    static Row apply(Row row, Map<String, String> mapping, List<String> dropFields) {
        Map<String, Object> fields = new LinkedHashMap<>();
        if (mapping.isEmpty()) {
            fields.putAll(row.fields());
        } else {
            for (Map.Entry<String, String> e : mapping.entrySet()) {
                if (row.fields().containsKey(e.getKey())) {
                    fields.put(e.getValue(), row.fields().get(e.getKey()));
                }
            }
        }
        for (String drop : dropFields) {
            fields.remove(drop);
        }
        return new Row(fields);
    }

    /** 解析 mapping："oldName:newName" 数组 → 有序映射；无冒号表示仅选择不改名。 */
    static Map<String, String> parseMapping(List<String> items) {
        Map<String, String> mapping = new LinkedHashMap<>();
        for (String item : items) {
            int idx = item.indexOf(':');
            if (idx < 0) {
                mapping.put(item, item);
            } else if (idx == 0 || idx == item.length() - 1) {
                throw new IllegalArgumentException("mapping 格式应为 oldName:newName: " + item);
            } else {
                mapping.put(item.substring(0, idx), item.substring(idx + 1));
            }
        }
        return mapping;
    }

    private static List<String> strListOrEmpty(Map<String, Object> params, String key) {
        return params.get(key) == null ? List.of() : Params.strList(params, key);
    }
}
