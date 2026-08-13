package com.sp.platform.components.csv;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** csv-source / csv-sink 解析与读写测试。 */
class CsvComponentsTest {

    @TempDir
    Path dir;

    @Test
    void sourceShouldParseHeaderAndRows() throws Exception {
        Path csv = dir.resolve("in.csv");
        Files.writeString(csv, "id,name,city\n1,张三,北京\n2,李四,上海\n3,,广州\n");

        CsvSource source = new CsvSource();
        source.open(Map.of("path", csv.toString(), "batchSize", 2), Context.single());

        List<Row> all = new ArrayList<>();
        List<Row> batch;
        while (!(batch = source.poll()).isEmpty()) {
            all.addAll(batch);
        }
        source.close();

        assertEquals(3, all.size());
        assertEquals("1", all.get(0).getString("id"));
        assertEquals("张三", all.get(0).getString("name"));
        assertEquals("北京", all.get(0).getString("city"));
        // 空字段解析为空串而不是丢失
        assertEquals("", all.get(2).getString("name"));
    }

    @Test
    void sourceShouldRespectDelimiterAndNoHeader() throws Exception {
        Path csv = dir.resolve("in.tsv");
        Files.writeString(csv, "1\tA\n2\tB\n");

        CsvSource source = new CsvSource();
        source.open(Map.of("path", csv.toString(), "delimiter", "\t", "hasHeader", false),
                Context.single());
        List<Row> all = new ArrayList<>(source.poll());
        source.close();

        assertEquals(2, all.size());
        assertEquals("1", all.get(0).getString("col_0"));
        assertEquals("A", all.get(0).getString("col_1"));
    }

    @Test
    void sinkShouldWriteHeaderAndRows() throws Exception {
        Path out = dir.resolve("out.csv");
        CsvSink sink = new CsvSink();
        sink.open(Map.of("path", out.toString()), Context.single());

        Map<String, Object> f1 = new LinkedHashMap<>();
        f1.put("a", "1");
        f1.put("b", "x");
        Map<String, Object> f2 = new LinkedHashMap<>();
        f2.put("a", "2");
        f2.put("b", "y");
        List<Row> batch = List.of(new Row(f1), new Row(f2));
        sink.write(batch);
        sink.close();

        List<String> lines = Files.readAllLines(out);
        assertEquals(List.of("a,b", "1,x", "2,y"), lines);
    }

    @Test
    void quotedRoundTrip() throws Exception {
        // 含逗号/引号的字段：sink 转义写出 → source 完整解析读回，值不变
        Path out = dir.resolve("quoted.csv");
        CsvSink sink = new CsvSink();
        sink.open(Map.of("path", out.toString()), Context.single());
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("id", "1");
        f.put("text", "张,三 \"经理\"");
        sink.write(List.of(new Row(f)));
        sink.close();

        CsvSource source = new CsvSource();
        source.open(Map.of("path", out.toString()), Context.single());
        List<Row> rows = source.poll();
        source.close();

        assertEquals(1, rows.size());
        assertEquals("1", rows.get(0).getString("id"));
        assertEquals("张,三 \"经理\"", rows.get(0).getString("text"));
    }

    @Test
    void sinkKeepsHeaderOrderWhenFieldsChange() throws Exception {
        // P2-6：表头=首批字段顺序；后续批缺失字段写空、新字段丢弃
        Path out = dir.resolve("cols.csv");
        CsvSink sink = new CsvSink();
        sink.open(Map.of("path", out.toString()), Context.single());

        Map<String, Object> f1 = new LinkedHashMap<>();
        f1.put("a", "1");
        f1.put("b", "x");
        sink.write(List.of(new Row(f1)));

        Map<String, Object> f2 = new LinkedHashMap<>(); // 缺 b，多 c
        f2.put("a", "2");
        f2.put("c", "new");
        sink.write(List.of(new Row(f2)));
        sink.close();

        List<String> lines = Files.readAllLines(out);
        assertEquals(List.of("a,b", "1,x", "2,"), lines);
    }
}
