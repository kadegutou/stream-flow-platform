package com.sp.platform.components.hdfs;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Sink;
import com.sp.platform.components.csv.CsvSink;
import com.sp.platform.components.Params;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FSDataOutputStream;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.Path;

import java.io.BufferedWriter;
import java.io.OutputStreamWriter;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * HDFS 输出控件（挑战项）：逻辑与 csv-sink 一致，文件系统换成 HDFS。
 * totalShards &gt; 1 时写分文件（.partN 后缀，与 csv-sink 同规则）。
 */
@ComponentDef(
        code = "hdfs-sink",
        name = "HDFS 输出",
        category = "SINK",
        description = "将数据批量写入 HDFS 文件；并行度>1 时输出多个分文件",
        icon = "hdd",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["hdfsUri", "path"],
                  "properties": {
                    "hdfsUri":     {"type": "string",  "title": "HDFS 地址", "default": "hdfs://namenode:8020"},
                    "path":        {"type": "string",  "title": "文件路径"},
                    "delimiter":   {"type": "string",  "title": "分隔符", "default": ","},
                    "shardIndex":  {"type": "integer", "title": "分片序号(引擎注入)", "default": 0},
                    "totalShards": {"type": "integer", "title": "总分片数(引擎注入)", "default": 1}
                  }
                }
                """)
public class HdfsSink implements Sink {

    private FileSystem fs;
    private BufferedWriter writer;
    private String delimiter;
    private List<String> columns;

    @Override
    public void open(Map<String, Object> params, Context ctx) throws Exception {
        String hdfsUri = Params.required(params, "hdfsUri");
        String path = Params.required(params, "path");
        this.delimiter = Params.str(params, "delimiter", ",");
        int shardIndex = Params.integer(params, "shardIndex", 0);
        int totalShards = Params.integer(params, "totalShards", 1);
        if (totalShards > 1) {
            path = CsvSink.shardPath(path, shardIndex);
        }

        Configuration conf = new Configuration();
        conf.set("fs.defaultFS", hdfsUri);
        fs = FileSystem.get(URI.create(hdfsUri), conf);
        FSDataOutputStream out = fs.create(new Path(path), true);
        this.writer = new BufferedWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8),
                8 * 1024 * 1024);
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
                    sb.append(com.sp.platform.components.csv.CsvParser.escape(
                            String.valueOf(v), delimiter));
                }
            }
            sb.append('\n');
        }
        writer.write(sb.toString());
    }

    @Override
    public void close() throws Exception {
        if (writer != null) {
            writer.close();
        }
        if (fs != null) {
            fs.close();
        }
    }
}
