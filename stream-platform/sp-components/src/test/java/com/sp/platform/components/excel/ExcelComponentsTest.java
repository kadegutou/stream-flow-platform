package com.sp.platform.components.excel;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Excel 控件 round-trip：SXSSF 写 xlsx → 流式读回，值一致。 */
class ExcelComponentsTest {

    @TempDir
    Path dir;

    @Test
    void writeThenReadRoundTrip() throws Exception {
        Path xlsx = dir.resolve("rt.xlsx");

        ExcelSink sink = new ExcelSink();
        sink.open(Map.of("path", xlsx.toString(), "sheetName", "Sheet1"), Context.single());
        List<Row> rows = new ArrayList<>();
        for (int i = 1; i <= 100; i++) {
            Map<String, Object> f = new LinkedHashMap<>();
            f.put("id", String.valueOf(i));
            f.put("name", "张三" + i);
            rows.add(new Row(f));
        }
        sink.write(rows.subList(0, 50));
        sink.write(rows.subList(50, 100));
        sink.close();

        ExcelSource source = new ExcelSource();
        source.open(Map.of("path", xlsx.toString(), "batchSize", 30), Context.single());
        List<Row> all = new ArrayList<>();
        List<Row> batch;
        while (!(batch = source.poll()).isEmpty()) {
            all.addAll(batch);
        }
        source.close();

        assertEquals(100, all.size());
        assertEquals("1", all.get(0).getString("id"));
        assertEquals("张三1", all.get(0).getString("name"));
        assertEquals("100", all.get(99).getString("id"));
        assertEquals("张三100", all.get(99).getString("name"));
    }
}
