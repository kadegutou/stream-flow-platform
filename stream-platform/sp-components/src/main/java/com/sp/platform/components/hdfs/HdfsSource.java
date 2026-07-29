package com.sp.platform.components.hdfs;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Source;
import com.sp.platform.components.Params;
import com.sp.platform.components.shard.ShardUtils;
import com.sp.platform.components.shard.ShardUtils.ShardedLineReader;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FSDataInputStream;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.Path;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * HDFS 输入控件（挑战项）：逻辑与 csv-source 一致，文件系统换成 HDFS。
 * 同样支持字节切片分片（与 csv 共用 {@link ShardUtils}）。
 */
@ComponentDef(
        code = "hdfs-source",
        name = "HDFS 输入",
        category = "SOURCE",
        description = "从 HDFS 文件批量读取数据（按分隔符解析），并行度>1 时自动按字节切片",
        icon = "hdd",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["hdfsUri", "path"],
                  "properties": {
                    "hdfsUri":     {"type": "string",  "title": "HDFS 地址", "default": "hdfs://namenode:8020"},
                    "path":        {"type": "string",  "title": "文件路径"},
                    "delimiter":   {"type": "string",  "title": "分隔符", "default": ","},
                    "hasHeader":   {"type": "boolean", "title": "首行为表头", "default": true},
                    "batchSize":   {"type": "integer", "title": "批大小", "default": 5000},
                    "shardIndex":  {"type": "integer", "title": "分片序号(引擎注入)", "default": 0},
                    "totalShards": {"type": "integer", "title": "总分片数(引擎注入)", "default": 1}
                  }
                }
                """)
public class HdfsSource implements Source {

    private FileSystem fs;
    private ShardedLineReader reader;
    private String delimiter;
    private String[] header;
    private int batchSize;
    private boolean eof;

    @Override
    public void open(Map<String, Object> params, Context ctx) throws Exception {
        String hdfsUri = Params.required(params, "hdfsUri");
        String path = Params.required(params, "path");
        this.delimiter = Params.str(params, "delimiter", ",");
        boolean hasHeader = Params.bool(params, "hasHeader", true);
        this.batchSize = Params.integer(params, "batchSize", 5000);
        int shardIndex = Params.integer(params, "shardIndex", 0);
        int totalShards = Params.integer(params, "totalShards", 1);

        Configuration conf = new Configuration();
        conf.set("fs.defaultFS", hdfsUri);
        fs = FileSystem.get(URI.create(hdfsUri), conf);
        Path file = new Path(path);
        long size = fs.getFileStatus(file).getLen();

        ShardUtils.ByteRange range = ShardUtils.range(size, shardIndex, totalShards);
        FSDataInputStream in = fs.open(file);
        in.seek(range.start());
        this.reader = new ShardedLineReader(in, range);
        if (hasHeader && shardIndex == 0) {
            String line = reader.readLine();
            if (line == null) {
                throw new IllegalArgumentException("HDFS 文件为空: " + path);
            }
            this.header = split(line);
        } else if (hasHeader) {
            // 非 0 号分片独立打开读首行获取列名
            try (FSDataInputStream headIn = fs.open(file)) {
                ShardedLineReader headReader = new ShardedLineReader(
                        headIn, new ShardUtils.ByteRange(0, size));
                String line = headReader.readLine();
                if (line == null) {
                    throw new IllegalArgumentException("HDFS 文件为空: " + path);
                }
                this.header = split(line);
            }
        }
    }

    @Override
    public List<Row> poll() throws Exception {
        if (eof) {
            return List.of();
        }
        List<Row> batch = new ArrayList<>(batchSize);
        while (batch.size() < batchSize) {
            String line = reader.readLine();
            if (line == null) {
                eof = true;
                break;
            }
            batch.add(parseLine(line));
        }
        return batch;
    }

    private Row parseLine(String line) {
        String[] values = split(line);
        Map<String, Object> fields = new LinkedHashMap<>(values.length * 2);
        for (int i = 0; i < values.length; i++) {
            String name = header != null && i < header.length ? header[i] : "col_" + i;
            fields.put(name, values[i]);
        }
        return new Row(fields);
    }

    private String[] split(String line) {
        return line.split(java.util.regex.Pattern.quote(delimiter), -1);
    }

    @Override
    public void close() throws Exception {
        if (reader != null) {
            reader.close();
        }
        if (fs != null) {
            fs.close();
        }
    }
}
