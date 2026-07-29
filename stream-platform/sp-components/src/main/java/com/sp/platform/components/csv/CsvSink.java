package com.sp.platform.components.csv;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Sink;
import com.sp.platform.components.Params;

import java.io.BufferedWriter;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * CSV 输出控件：8MB 缓冲写，首行写表头。
 *
 * <p>分片输出：totalShards &gt; 1 时每个分片写独立分文件，避免并发写同一文件互相踩踏
 * （out.csv → out.part0.csv / out.part1.csv ...）。不做合并，分片输出即多个分文件，
 * 下游可自行 cat 合并。shardIndex/totalShards 由执行引擎注入。
 */
@ComponentDef(
        code = "csv-sink",
        name = "CSV 输出",
        category = "SINK",
        description = "将数据批量写入 CSV 文件，8MB 缓冲",
        icon = "file-done",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["path"],
                  "properties": {
                    "path":        {"type": "string",  "title": "文件路径"},
                    "delimiter":   {"type": "string",  "title": "分隔符", "default": ","},
                    "shardIndex":  {"type": "integer", "title": "分片序号(引擎注入)", "default": 0},
                    "totalShards": {"type": "integer", "title": "总分片数(引擎注入)", "default": 1}
                  }
                }
                """)
public class CsvSink implements Sink {

    private static final int BUFFER_SIZE = 8 * 1024 * 1024; // 8MB

    private BufferedWriter writer;
    private String delimiter;
    private List<String> columns;

    @Override
    public void open(Map<String, Object> params, Context ctx) throws Exception {
        String path = Params.required(params, "path");
        this.delimiter = Params.str(params, "delimiter", ",");
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
            columns = new ArrayList<>(batch.get(0).fields().keySet());
            writer.write(String.join(delimiter, columns));
            writer.newLine();
        }
        StringBuilder sb = new StringBuilder(4096);
        for (Row row : batch) {
            for (int i = 0; i < columns.size(); i++) {
                if (i > 0) {
                    sb.append(delimiter);
                }
                Object v = row.fields().get(columns.get(i));
                if (v != null) {
                    sb.append(v);
                }
            }
            sb.append('\n');
        }
        writer.write(sb.toString());
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
