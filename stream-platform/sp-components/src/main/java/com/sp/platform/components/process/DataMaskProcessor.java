package com.sp.platform.components.process;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Processor;
import com.sp.platform.components.Params;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 数据脱敏控件：rules（"fieldName:strategy" 数组）。
 * strategy：mask-middle（中间打码，如手机 138****1234）/ hash（SHA-256）/ hide（替换为 ***）。
 */
@ComponentDef(
        code = "data-mask",
        name = "数据脱敏",
        category = "PROCESS",
        description = "按规则对字段脱敏：mask-middle / hash(SHA-256) / hide",
        icon = "safety",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["rules"],
                  "properties": {
                    "rules": {"type": "array", "title": "脱敏规则 fieldName:strategy(mask-middle/hash/hide)", "items": {"type": "string"}}
                  }
                }
                """)
public class DataMaskProcessor implements Processor {

    private Map<String, String> rules; // fieldName -> strategy

    @Override
    public void open(Map<String, Object> params, Context ctx) {
        this.rules = parseRules(Params.strList(params, "rules"));
    }

    @Override
    public List<Row> process(List<Row> batch) {
        List<Row> out = new ArrayList<>(batch.size());
        for (Row row : batch) {
            Map<String, Object> fields = new LinkedHashMap<>(row.fields());
            for (Map.Entry<String, String> e : rules.entrySet()) {
                Object v = fields.get(e.getKey());
                if (v != null) {
                    fields.put(e.getKey(), mask(String.valueOf(v), e.getValue()));
                }
            }
            out.add(new Row(fields));
        }
        return out;
    }

    /** 解析规则："fieldName:strategy" 数组 → 有序映射；非法策略抛异常。 */
    static Map<String, String> parseRules(List<String> items) {
        Map<String, String> rules = new LinkedHashMap<>();
        for (String item : items) {
            int idx = item.indexOf(':');
            if (idx <= 0 || idx == item.length() - 1) {
                throw new IllegalArgumentException(
                        "rules 格式应为 fieldName:strategy: " + item);
            }
            String strategy = item.substring(idx + 1);
            switch (strategy) {
                case "mask-middle", "hash", "hide" -> rules.put(item.substring(0, idx), strategy);
                default -> throw new IllegalArgumentException("未知脱敏策略: " + strategy);
            }
        }
        return rules;
    }

    /** 对单个值按策略脱敏。 */
    static String mask(String value, String strategy) {
        return switch (strategy) {
            case "mask-middle" -> maskMiddle(value);
            case "hash" -> sha256(value);
            case "hide" -> "***";
            default -> throw new IllegalArgumentException("未知脱敏策略: " + strategy);
        };
    }

    /** 中间打码：保留首尾，中间用 * 替代（手机号风格：前 3 后 4；长度≤3 时保留首字符）。 */
    static String maskMiddle(String value) {
        int len = value.length();
        if (len <= 1) {
            return "*";
        }
        if (len <= 3) {
            return value.charAt(0) + "*".repeat(len - 1);
        }
        int head = Math.max(1, len / 3);
        int tail = len >= 8 ? 4 : Math.max(1, len / 3);
        return value.substring(0, head) + "*".repeat(len - head - tail) + value.substring(len - tail);
    }

    static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }
}
