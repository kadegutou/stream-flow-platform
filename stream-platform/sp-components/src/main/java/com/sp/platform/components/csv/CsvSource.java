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
 *
 * <p>解析（quoteMode=auto）：行内无引号走手动扫描快速路径（无正则，性能优先，§8）；
 * 检测到引号走 RFC 4180 完整解析。已知限制：不支持字段内嵌换行（与分片行对齐机制冲突）。
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
                    "quoteMode":   {"type": "string",  "title": "引号模式(auto走RFC4180/none纯快速切分，不支持字段内换行)", "enum": ["auto", "none"], "default": "auto"},
                    "resumeOffset": {"type": "integer", "title": "断点续读偏移(引擎注入)", "default": 0},
                    "shardIndex":  {"type": "integer", "title": "分片序号(引擎注入)", "default": 0},
                    "totalShards": {"type": "integer", "title": "总分片数(引擎注入)", "default": 1}
                  }
                }
                """)
public class CsvSource implements Source {

    private ShardedLineReader reader;
    private String delimiter;
    private String quoteMode;
    private String[] header;
    private int batchSize;
    private boolean eof;

    @Override
    public void open(Map<String, Object> params, Context ctx) throws Exception {
        String path = Params.required(params, "path");
        this.delimiter = Params.str(params, "delimiter", ",");
        boolean hasHeader = Params.bool(params, "hasHeader", true);
        this.batchSize = Params.integer(params, "batchSize", 5000);
        this.quoteMode = Params.str(params, "quoteMode", "auto");
        long resumeOffset = Params.integer(params, "resumeOffset", 0);
        int shardIndex = Params.integer(params, "shardIndex", 0);
        int totalShards = Params.integer(params, "totalShards", 1);

        File file = new File(path);
        ShardUtils.ByteRange range = ShardUtils.range(file.length(), shardIndex, totalShards);
        FileInputStream fis = new FileInputStream(file);
        if (resumeOffset > range.start()) {
            // 断点续传：偏移由本组件在行边界记录，直接定位、不丢首行
            long start = Math.min(resumeOffset, file.length());
            fis.getChannel().position(start);
            this.reader = new ShardedLineReader(new BufferedInputStream(fis, 8 * 1024 * 1024),
                    new ShardUtils.ByteRange(start, range.endExclusive()),
                    java.nio.charset.StandardCharsets.UTF_8, false);
        } else {
            fis.getChannel().position(range.start());
            // 8MB 缓冲：ShardedLineReader 按字节读，底层必须缓冲
            this.reader = new ShardedLineReader(new BufferedInputStream(fis, 8 * 1024 * 1024), range);
        }
        if (hasHeader && shardIndex == 0 && resumeOffset <= 0) {
            // 0 号分片的字节区间包含表头：从分片流中消费首行作为列名，不作为数据行
            String line = reader.readLine();
            if (line == null) {
                throw new IllegalArgumentException("CSV 文件为空: " + path);
            }
            this.header = split(line);
        } else if (hasHeader) {
            // 其余分片/断点续读的区间不含表头：独立打开文件读首行获取列名（开销可忽略）
            this.header = readHeader(file);
        }
    }

    /** 断点续传：当前已读字节偏移（行边界），引擎随上报持久化到分片 progress。 */
    @Override
    public long progress() {
        return reader == null ? -1 : reader.position();
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

    /** 解析：无引号走快速路径（无正则），有引号走 RFC 4180（见 {@link CsvParser}）。 */
    private String[] split(String line) {
        return CsvParser.parseLine(line, delimiter, quoteMode);
    }

    @Override
    public void close() throws Exception {
        if (reader != null) {
            reader.close();
        }
    }
}
