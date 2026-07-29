package com.sp.platform.common;

import java.util.Map;

/**
 * 一条记录：字段名 -> 值。批处理模型，管道内传递 List&lt;Row&gt;。
 * 对应设计文档 §5.1。
 */
public record Row(Map<String, Object> fields) {

    public Object get(String field) {
        return fields.get(field);
    }

    public String getString(String field) {
        Object v = fields.get(field);
        return v == null ? null : String.valueOf(v);
    }
}
