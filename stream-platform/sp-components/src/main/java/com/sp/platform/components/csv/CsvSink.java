package com.sp.platform.components.csv;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Sink;
import com.sp.platform.components.Params;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedWriter;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * CSV 输出控件：8MB 缓冲写，首行写表头。
 *
 * <p>列顺序：表头 = 首批字段顺序，后续批次按表头顺序取值；缺失字段写空字符串，
 * 表头外的新字段丢弃并打一次 WARN（每实例一次）。
 *
 * <p>写出转义（quoteMode=auto）：字段含分隔符/引号/换行时按 RFC 4180 加引号并转义。
 *
 * <p>分片输出：totalShards &gt; 1 时每个分片写独立分文件，避免并发写同一文件互相踩踏
 * （out.csv → out.part0.csv / out.part1.csv ...）。不做合并，分片输出即多个分文件，
 * 下游可自行 cat 合并。shardIndex/totalShards 由执行引擎注入。
 */
@ComponentDef(
        code = "csv-sink",
        name = "CSV 输出",
        category = "SINK",
        description = "将数据批量写入 CSV 文件，8MB 缓冲；字段含分隔符/引号时按 RFC 4180 转义（不支持字段内换行）",
        icon = "file-done",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["path"],
                  "properties": {
                    "path":        {"type": "string",  "title": "文件路径"},
                    "delimiter":   {"type": "string",  "title": "分隔符", "default": ","},
                    "quoteMode":   {"type": "string",  "title": "引号模式(auto转义/none原样写出)", "enum": ["auto", "none"], "default": "auto"},
                    "shardIndex":  {"type": "integer", "title": "分片序号(引擎注入)", "default": 0},
                    "totalShards": {"type": "integer", "title": "总分片数(引擎注入)", "default": 1}
                  }
                }
                """)
public class CsvSink implements Sink {

    private static final Logger log = LoggerFactory.getLogger(CsvSink.class);
    private static final int BUFFER_SIZE = 8 * 1024 * 1024; // 8MB

    private BufferedWriter writer;
    private String delimiter;
    private String quoteMode;
    private List<String> columns;
    private boolean unknownFieldWarned;

    @Override
    public void open(Map<String, Object> params, Context ctx) throws Exception {
        String path = Params.required(params, "path");
        this.delimiter = Params.str(params, "delimiter", ",");
        this.quoteMode = Params.str(params, "quoteMode", "auto");
        int shardIndex = Params.integer(params, "shardIndex", 0);
        int totalShards = Params.integer(params, "totalShards", 1);
        if (totalShards > 1) {
            path = shardPath(path, shardIndex);
        }
        this.writer = new BufferedWriter(new OutputStreamWriter(
                new FileOutputStream(path), StandardCharsets.UTF_8), BUFFER_SIZE);
    }

    @Override
    public void write(List<Row> batch) throws Exception {
        if (batch.isEmpty()) {
            return;
        }
        if (columns == null) {
            // 表头 = 首批字段顺序，此后固定
            columns = new ArrayList<>(batch.get(0).fields().keySet());
            writer.write(String.join(delimiter, columns));
            writer.newLine();
        }
        StringBuilder sb = new StringBuilder(4096);
        Set<String> unknown = null;
        for (Row row : batch) {
            Map<String, Object> fields = row.fields();
            for (int i = 0; i < columns.size(); i++) {
                if (i > 0) {
                    sb.append(delimiter);
                }
                Object v = fields.get(columns.get(i));
                if (v != null) {
                    sb.append(escape(String.valueOf(v)));
                }
            }
            sb.append('\n');
            // 表头外新字段：收集，写出后统一 WARN 一次
            if (!unknownFieldWarned) {
                for (String k : fields.keySet()) {
                    if (!columns.contains(k)) {
                        if (unknown == null) {
                            unknown = new LinkedHashSet<>();
                        }
                        unknown.add(k);
                    }
                }
            }
        }
        writer.write(sb.toString());
        if (unknown != null && !unknown.isEmpty()) {
            unknownFieldWarned = true;
            log.warn("csv-sink 出现表头外新字段，已丢弃（后续不再重复告警）: {}", unknown);
        }
    }

    private String escape(String value) {
        return "none".equals(quoteMode) ? value : CsvParser.escape(value, delimiter);
    }

    /** out.csv → out.part{shardIndex}.csv；无扩展名则直接追加。 */
    public static String shardPath(String path, int shardIndex) {
        int dot = path.lastIndexOf('.');
        int slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        if (dot > slash) {
            return path.substring(0, dot) + ".part" + shardIndex + path.substring(dot);
        }
        return path + ".part" + shardIndex;
    }

    @Override
    public void close() throws Exception {
        if (writer != null) {
            writer.close();
        }
    }
}
