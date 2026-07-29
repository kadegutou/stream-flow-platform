package com.sp.platform.components;

import java.util.List;
import java.util.Map;

/** 控件参数读取小工具：带默认值的类型转换。 */
public final class Params {

    private Params() {
    }

    public static String str(Map<String, Object> params, String key, String def) {
        Object v = params.get(key);
        return v == null ? def : String.valueOf(v);
    }

    public static String required(Map<String, Object> params, String key) {
        Object v = params.get(key);
        if (v == null || String.valueOf(v).isBlank()) {
            throw new IllegalArgumentException("缺少必填参数: " + key);
        }
        return String.valueOf(v);
    }

    public static int integer(Map<String, Object> params, String key, int def) {
        Object v = params.get(key);
        if (v == null) {
            return def;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        return Integer.parseInt(String.valueOf(v));
    }

    public static boolean bool(Map<String, Object> params, String key, boolean def) {
        Object v = params.get(key);
        if (v == null) {
            return def;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        return Boolean.parseBoolean(String.valueOf(v));
    }

    @SuppressWarnings("unchecked")
    public static List<String> strList(Map<String, Object> params, String key) {
        Object v = params.get(key);
        if (v == null) {
            throw new IllegalArgumentException("缺少必填参数: " + key);
        }
        if (v instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        // 兼容逗号分隔字符串
        return List.of(String.valueOf(v).split(","));
    }
}
