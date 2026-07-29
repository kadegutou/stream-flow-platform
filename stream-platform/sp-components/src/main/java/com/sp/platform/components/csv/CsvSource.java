package com.sp.platform.components.csv;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Source;
import com.sp.platform.components.Params;
import com.sp.platform.components.shard.ShardUtils;
import com.sp.platform.components.shard.ShardUtils.ShardedLineReader;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * CSV 输入控件：8MB 缓冲读取，自研轻量解析（按分隔符 split，无第三方 csv 库）。
 * 对应设计文档 §5.3 / §8。
 *
 * <p>支持文件分片（§7 横向扩展）：totalShards &gt; 1 时按字节区间切片、
 * 按行边界对齐，各分片读取互不重叠的区段。shardIndex/totalShards 默认 0/1，
 * 由执行引擎按分片信息自动注入，无需手工填写。
 */
@ComponentDef(
        code = "csv-source",
        name = "CSV 输入",
        category = "SOURCE",
        description = "从 CSV 文件批量读取数据，8MB 缓冲，按分隔符轻量解析；并行度>1 时自动按字节切片",
        icon = "file-text",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["path"],
                  "properties": {
                    "path":        {"type": "string",  "title": "文件路径"},
                    "delimiter":   {"type": "string",  "title": "分隔符", "default": ","},
                    "hasHeader":   {"type": "boolean", "title": "首行为表头", "default": true},
                    "batchSize":   {"type": "integer", "title": "批大小", "default": 5000},
                    "shardIndex":  {"type": "integer", "title": "分片序号(引擎注入)", "default": 0},
                    "totalShards": {"type": "integer", "title": "总分片数(引擎注入)", "default": 1}
                  }
                }
                """)
public class CsvSource implements Source {

    private ShardedLineReader reader;
    private String delimiter;
    private String[] header;
    private int batchSize;
    private boolean eof;

    @Override
    public void open(Map<String, Object> params, Context ctx) throws Exception {
        String path = Params.required(params, "path");
        this.delimiter = Params.str(params, "delimiter", ",");
        boolean hasHeader = Params.bool(params, "hasHeader", true);
        this.batchSize = Params.integer(params, "batchSize", 5000);
        int shardIndex = Params.integer(params, "shardIndex", 0);
        int totalShards = Params.integer(params, "totalShards", 1);

        File file = new File(path);
        ShardUtils.ByteRange range = ShardUtils.range(file.length(), shardIndex, totalShards);
        FileInputStream fis = new FileInputStream(file);
        fis.getChannel().position(range.start());
        // 8MB 缓冲：ShardedLineReader 按字节读，底层必须缓冲
        this.reader = new ShardedLineReader(new BufferedInputStream(fis, 8 * 1024 * 1024), range);
        if (hasHeader && shardIndex == 0) {
            // 0 号分片的字节区间包含表头：从分片流中消费首行作为列名，不作为数据行
            String line = reader.readLine();
            if (line == null) {
                throw new IllegalArgumentException("CSV 文件为空: " + path);
            }
            this.header = split(line);
        } else if (hasHeader) {
            // 其余分片的区间不含表头：独立打开文件读首行获取列名（只读首行，开销可忽略）
            this.header = readHeader(file);
        }
    }

    /** 非 0 号分片独立打开文件头读首行作为列名。 */
    private String[] readHeader(File file) throws Exception {
        try (FileInputStream fis = new FileInputStream(file)) {
            ShardedLineReader headReader = new ShardedLineReader(
                    new BufferedInputStream(fis), new ShardUtils.ByteRange(0, file.length()));
            String line = headReader.readLine();
            if (line == null) {
                throw new IllegalArgumentException("CSV 文件为空: " + file);
            }
            return split(line);
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

    /** 轻量解析：按分隔符切分（不支持引号转义，性能优先，见设计 §8 零拷贝解析）。 */
    private String[] split(String line) {
        return line.split(java.util.regex.Pattern.quote(delimiter), -1);
    }

    @Override
    public void close() throws Exception {
        if (reader != null) {
            reader.close();
        }
    }
}
