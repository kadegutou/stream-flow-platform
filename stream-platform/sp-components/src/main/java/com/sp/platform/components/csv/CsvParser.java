package com.sp.platform.components.csv;

import java.util.ArrayList;
import java.util.List;

/**
 * CSV 解析/转义工具（RFC 4180 子集）。
 *
 * <p>解析分两条路径：
 * <ul>
 *   <li><b>快速路径</b>：行内不含引号字符时，按分隔符手动 indexOf 扫描切分（无正则，
 *       避免 String.split 每行编译正则的开销），与历史行为一致；</li>
 *   <li><b>完整解析</b>：检测到引号才走 RFC 4180 引号语义——带引号字段内的分隔符不当
 *       分隔符、双引号转义（""→"）、去首尾引号。</li>
 * </ul>
 *
 * <p><b>已知限制</b>：不支持字段内嵌换行——与文件字节分片的按行对齐机制冲突
 * （分片按 \n 字节切行，字段内换行会被切成两行）。
 */
public final class CsvParser {

    private CsvParser() {
    }

    /**
     * 解析一行。quoteMode=auto：无引号走快速路径，有引号走 RFC 4180 完整解析；
     * quoteMode=none：始终快速路径（引号不当特殊字符）。
     */
    public static String[] parseLine(String line, String delimiter, String quoteMode) {
        if ("none".equals(quoteMode) || line.indexOf('"') < 0) {
            return fastSplit(line, delimiter);
        }
        return fullParse(line, delimiter);
    }

    /** 快速路径：手动 indexOf 扫描切分（无正则），保留尾部空字段。 */
    public static String[] fastSplit(String line, String delimiter) {
        List<String> out = new ArrayList<>(16);
        int from = 0;
        while (true) {
            int idx = line.indexOf(delimiter, from);
            if (idx < 0) {
                out.add(line.substring(from));
                break;
            }
            out.add(line.substring(from, idx));
            from = idx + delimiter.length();
        }
        return out.toArray(new String[0]);
    }

    /** 完整解析：RFC 4180 引号语义（字段内换行不支持，见类注释）。 */
    public static String[] fullParse(String line, String delimiter) {
        List<String> out = new ArrayList<>(16);
        int len = line.length();
        int i = 0;
        while (true) {
            StringBuilder field = new StringBuilder();
            boolean quoted = i < len && line.charAt(i) == '"';
            if (quoted) {
                i++; // 跳过起始引号
                boolean closed = false;
                while (i < len) {
                    char c = line.charAt(i);
                    if (c == '"') {
                        if (i + 1 < len && line.charAt(i + 1) == '"') {
                            field.append('"'); // "" 转义为 "
                            i += 2;
                        } else {
                            i++; // 结束引号
                            closed = true;
                            break;
                        }
                    } else {
                        field.append(c);
                        i++;
                    }
                }
                if (!closed) {
                    throw new IllegalArgumentException("CSV 引号未闭合: " + line);
                }
            } else {
                int idx = indexOf(line, delimiter, i);
                if (idx < 0) {
                    field.append(line, i, len);
                    i = len;
                } else {
                    field.append(line, i, idx);
                    i = idx;
                }
            }
            out.add(field.toString());
            // 字段结束后：要么分隔符，要么行尾
            if (i >= len) {
                break;
            }
            if (matchesAt(line, delimiter, i)) {
                i += delimiter.length();
                if (i >= len) {
                    out.add(""); // 行尾分隔符 → 尾部空字段
                    break;
                }
            } else {
                throw new IllegalArgumentException(
                        "CSV 引号字段后缺少分隔符: " + line.substring(0, Math.min(len, i + 10)));
            }
        }
        return out.toArray(new String[0]);
    }

    /** 写出转义：字段含分隔符/引号/换行时按 RFC 4180 加引号并转义内部引号。 */
    public static String escape(String value, String delimiter) {
        if (value == null) {
            return "";
        }
        if (value.indexOf('"') < 0 && !value.contains(delimiter)
                && value.indexOf('\n') < 0 && value.indexOf('\r') < 0) {
            return value;
        }
        return '"' + value.replace("\"", "\"\"") + '"';
    }

    private static int indexOf(String s, String sub, int from) {
        return s.indexOf(sub, from);
    }

    private static boolean matchesAt(String s, String sub, int at) {
        return at + sub.length() <= s.length() && s.startsWith(sub, at);
    }
}
