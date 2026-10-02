package com.sp.platform.components.excel;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.openxml4j.opc.PackageAccess;
import org.apache.poi.openxml4j.opc.PackagePart;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.model.SharedStrings;
import org.apache.poi.xssf.streaming.SXSSFRow;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFRichTextString;
import org.apache.poi.xssf.usermodel.XSSFRow;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xssf.usermodel.XSSFRelation;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Excel 控件：SXSSF 写 xlsx → 流式读回；以及并行分片下「不重复、不丢失」的行区间切分。 */
class ExcelComponentsTest {

    @TempDir
    Path dir;

    @Test
    void writeThenReadRoundTrip() throws Exception {
        Path xlsx = dir.resolve("rt.xlsx");

        ExcelSink sink = new ExcelSink();
        sink.open(Map.of("path", xlsx.toString(), "sheetName", "Sheet1"), Context.single());
        List<Row> rows = dataRows(100);
        sink.write(rows.subList(0, 50));
        sink.write(rows.subList(50, 100));
        sink.close();

        List<String> all = readIds(xlsx, 0, 1, 0L);

        assertEquals(100, all.size());
        assertEquals("1", all.get(0));
        assertEquals("100", all.get(99));
    }

    // ==================== 行区间分片 ====================

    @Test
    void shardedReadCoversEveryRowExactlyOnce() throws Exception {
        Path xlsx = writeBook("shard.xlsx", 1000);
        List<String> full = readIds(xlsx, 0, 1, 0L);
        assertEquals(1000, full.size());

        for (int shards = 2; shards <= 5; shards++) {
            List<String> merged = new ArrayList<>();
            for (int i = 0; i < shards; i++) {
                merged.addAll(readIds(xlsx, i, shards, 0L));
            }
            // 区间首尾相接，合并结果应与单分片逐行一致：既不重复也不丢失
            assertEquals(full, merged, "分片数=" + shards + " 时合并结果应与全量一致");
        }
    }

    @Test
    void shardedReadHandlesFewerRowsThanShards() throws Exception {
        Path xlsx = writeBook("tiny.xlsx", 3);
        List<String> merged = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            merged.addAll(readIds(xlsx, i, 5, 0L));
        }
        assertEquals(List.of("1", "2", "3"), merged, "行数少于分片数时仍须恰好覆盖全部行");
    }

    @Test
    void shardedReadWithoutHeader() throws Exception {
        Path xlsx = writeBook("nohdr.xlsx", 300);
        // hasHeader=false：文件首行（ExcelSink 写的 id/name 表头）也按数据行处理，
        // 列名由解析器补为 col_N，故共 301 行
        List<String> full = readIds(xlsx, 0, 1, 0L, false, "col_0");
        assertEquals(301, full.size());
        assertEquals("id", full.get(0));

        for (int shards = 2; shards <= 4; shards++) {
            List<String> merged = new ArrayList<>();
            for (int i = 0; i < shards; i++) {
                merged.addAll(readIds(xlsx, i, shards, 0L, false, "col_0"));
            }
            assertEquals(full, merged, "无表头模式下分片结果同样应与全量一致");
        }
    }

    @Test
    void resumeFromRowOffsetSkipsConsumedRows() throws Exception {
        Path xlsx = writeBook("resume.xlsx", 200);
        assertEquals(200, readIds(xlsx, 0, 1, 0L).size());

        List<String> rest = readIds(xlsx, 0, 1, 120L);
        assertEquals(80, rest.size(), "断点续传应只返回剩余行");
        assertEquals("121", rest.get(0));
        assertEquals("200", rest.get(79));
    }

    @Test
    void progressReportsNextRowOrdinal() throws Exception {
        Path xlsx = writeBook("prog.xlsx", 50);
        ExcelSource source = new ExcelSource();
        source.open(params(xlsx, 0, 1, 0L, true), new Context(0, null, 1));
        while (!source.poll().isEmpty()) {
            // 读到 EOF
        }
        assertEquals(50, source.progress(), "读完 50 行后断点应指向第 51 行（序号 50）");
        source.close();
    }

    @Test
    void shardedWriteProducesPartFiles() throws Exception {
        Path base = dir.resolve("out.xlsx");
        for (int i = 0; i < 3; i++) {
            ExcelSink sink = new ExcelSink();
            sink.open(params(base, i, 3, 0L, true), new Context(i, null, 3));
            sink.write(dataRows(10));
            sink.close();
        }
        for (int i = 0; i < 3; i++) {
            assertTrue(Files.exists(dir.resolve("out.part" + i + ".xlsx")),
                    "并行度>1 时应写出分片文件 out.part" + i + ".xlsx");
        }
        assertFalse(Files.exists(base), "并行度>1 时不应再写原始文件名，避免与分片文件混淆");
    }

    @Test
    void lastRowOfDimensionRef() {
        assertEquals(10001, ExcelSource.lastRowOf("A1:F10001"));
        assertEquals(77, ExcelSource.lastRowOf("AA77:ZZ77"));
        assertEquals(1, ExcelSource.lastRowOf("A1"));
        assertEquals(-1, ExcelSource.lastRowOf(null));
        assertEquals(-1, ExcelSource.lastRowOf("  "));
    }

    /**
     * 无共享字符串表的 xlsx（字符串全部内联，典型如 openpyxl 的产物）：
     * 文件内不存在 /xl/sharedStrings.xml，源必须优雅降级而不是抛 "Stream closed"。
     */
    @Test
    void readsWorkbookWithoutSharedStringsTable() throws Exception {
        Path xlsx = dir.resolve("inline.xlsx");
        SXSSFWorkbook wb = new SXSSFWorkbook(null, 100, false, false);
        try {
            SXSSFSheet sheet = wb.createSheet("Sheet1");
            SXSSFRow head = sheet.createRow(0);
            head.createCell(0).setCellValue("id");
            head.createCell(1).setCellValue("name");
            List<Row> rows = dataRows(120);
            for (int i = 0; i < rows.size(); i++) {
                SXSSFRow r = sheet.createRow(i + 1);
                r.createCell(0).setCellValue(rows.get(i).getString("id"));
                r.createCell(1).setCellValue(rows.get(i).getString("name"));
            }
            try (FileOutputStream out = new FileOutputStream(xlsx.toFile())) {
                wb.write(out);
            }
        } finally {
            wb.close();
            wb.dispose();
        }

        List<String> full = readIds(xlsx, 0, 1, 0L);
        assertEquals(120, full.size());
        assertEquals("1", full.get(0));
        assertEquals("120", full.get(119));

        for (int shards = 2; shards <= 4; shards++) {
            List<String> merged = new ArrayList<>();
            for (int i = 0; i < shards; i++) {
                merged.addAll(readIds(xlsx, i, shards, 0L));
            }
            assertEquals(full, merged, "无共享串表 + 分片时同样应不重不漏");
        }
    }

    // ==================== 共享字符串表（LightSharedStrings） ====================

    /**
     * 富文本单元格：一个单元格内多段不同格式（{@code <si><r><t>…}）必须按顺序拼接，
     * 不能被截断成最后一段。这是自研轻量共享串表最容易被写错的地方。
     */
    @Test
    void richTextCellIsConcatenated() throws Exception {
        Path xlsx = dir.resolve("richtext.xlsx");
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            XSSFFont bold = wb.createFont();
            bold.setBold(true);
            XSSFFont normal = wb.createFont();
            XSSFSheet sheet = wb.createSheet("S");
            XSSFRow head = sheet.createRow(0);
            head.createCell(0).setCellValue("id");
            head.createCell(1).setCellValue("name");
            head.createCell(2).setCellValue("note");

            XSSFRow r1 = sheet.createRow(1);
            r1.createCell(0).setCellValue("1");
            XSSFRichTextString two = new XSSFRichTextString();
            two.append("Hello", normal);
            two.append("World", bold);
            r1.createCell(1).setCellValue(two);
            XSSFRichTextString three = new XSSFRichTextString();
            three.append("A", normal);
            three.append("BB", bold);
            three.append("CCC", normal);
            r1.createCell(2).setCellValue(three);

            XSSFRow r2 = sheet.createRow(2);
            r2.createCell(0).setCellValue("2");
            r2.createCell(1).setCellValue("line1\nline2");
            r2.createCell(2).setCellValue("plain");
            try (FileOutputStream out = new FileOutputStream(xlsx.toFile())) {
                wb.write(out);
            }
        }

        assertEquals(List.of("1", "2"), readIds(xlsx, 0, 1, 0L));
        List<Map<String, Object>> all = readAllFields(xlsx);
        assertEquals("HelloWorld", all.get(0).get("name"), "两段富文本应按顺序拼接");
        assertEquals("ABBCCC", all.get(0).get("note"), "三段富文本应按顺序拼接");
        assertEquals("line1\nline2", all.get(1).get("name"), "单元格内换行应保留");
    }

    /**
     * 自研 {@link LightSharedStrings} 与 POI 官方 {@code SharedStringsTable} 逐条比对，
     * 保证「换实现」不改变读取语义。
     */
    @Test
    void lightSharedStringsMatchesPoiOfficial() throws Exception {
        Path xlsx = writeBook("sst-compare.xlsx", 200);

        List<String> official = new ArrayList<>();
        try (OPCPackage pkg = OPCPackage.open(xlsx.toString(), PackageAccess.READ)) {
            SharedStrings sst = new XSSFReader(pkg).getSharedStringsTable();
            for (int i = 0; i < sst.getUniqueCount(); i++) {
                official.add(sst.getItemAt(i).getString());
            }
        }

        List<String> light = new ArrayList<>();
        try (OPCPackage pkg = OPCPackage.open(xlsx.toString(), PackageAccess.READ)) {
            PackagePart part = pkg.getPartsByContentType(
                    XSSFRelation.SHARED_STRINGS.getContentType()).get(0);
            LightSharedStrings sst;
            try (InputStream in = part.getInputStream()) {
                sst = LightSharedStrings.read(in, 64);
            }
            for (int i = 0; i < sst.size(); i++) {
                light.add(sst.entryAt(i));
            }
        }

        assertFalse(official.isEmpty(), "测试文件必须含共享字符串表");
        assertEquals(official, light, "自研共享串表与 POI 官方实现必须逐条一致");
        assertTrue(light.contains("id") && light.contains("name"));
    }

    /** 越界索引返回 null（由调用方回退为原始文本），而不是抛异常中断整个作业。 */
    @Test
    void lightSharedStringsOutOfRangeReturnsNull() throws Exception {
        String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\""
                + " count=\"1\" uniqueCount=\"1\"><si><t>only</t></si></sst>";
        LightSharedStrings sst = LightSharedStrings.read(
                new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)), 1);
        assertEquals(1, sst.size());
        assertEquals("only", sst.entryAt(0));
        assertEquals(null, sst.entryAt(1), "越界应返回 null");
        assertEquals(null, sst.entryAt(-1), "负索引应返回 null");
    }

    // ==================== 辅助 ====================

    /** 读出全部行字段（用于校验富文本/换行等具体取值）。 */
    private static List<Map<String, Object>> readAllFields(Path xlsx) throws Exception {
        ExcelSource source = new ExcelSource();
        source.open(params(xlsx, 0, 1, 0L, true), Context.single());
        List<Map<String, Object>> all = new ArrayList<>();
        try {
            List<Row> batch;
            while (!(batch = source.poll()).isEmpty()) {
                for (Row r : batch) {
                    all.add(r.fields());
                }
            }
        } finally {
            source.close();
        }
        return all;
    }

    private Path writeBook(String name, int dataRows) throws Exception {
        Path xlsx = dir.resolve(name);
        ExcelSink sink = new ExcelSink();
        sink.open(Map.of("path", xlsx.toString(), "sheetName", "Sheet1"), Context.single());
        List<Row> rows = dataRows(dataRows);
        for (int i = 0; i < rows.size(); i += 40) {
            sink.write(rows.subList(i, Math.min(rows.size(), i + 40)));
        }
        sink.close();
        return xlsx;
    }

    private static List<Row> dataRows(int n) {
        List<Row> rows = new ArrayList<>(n);
        for (int i = 1; i <= n; i++) {
            Map<String, Object> f = new LinkedHashMap<>();
            f.put("id", String.valueOf(i));
            f.put("name", "张三" + i);
            rows.add(new Row(f));
        }
        return rows;
    }

    private static Map<String, Object> params(Path path, int shardIndex, int totalShards,
                                              long resumeRow, boolean hasHeader) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("path", path.toString());
        p.put("batchSize", 37);
        p.put("hasHeader", hasHeader);
        p.put("shardIndex", shardIndex);
        p.put("totalShards", totalShards);
        if (resumeRow > 0) {
            p.put("resumeOffset", resumeRow);
        }
        return p;
    }

    private static List<String> readIds(Path xlsx, int shardIndex, int totalShards, long resumeRow)
            throws Exception {
        return readIds(xlsx, shardIndex, totalShards, resumeRow, true, "id");
    }

    private static List<String> readIds(Path xlsx, int shardIndex, int totalShards, long resumeRow,
                                        boolean hasHeader, String column) throws Exception {
        ExcelSource source = new ExcelSource();
        source.open(params(xlsx, shardIndex, totalShards, resumeRow, hasHeader),
                new Context(shardIndex, null, totalShards));
        List<String> values = new ArrayList<>();
        List<Row> batch;
        while (!(batch = source.poll()).isEmpty()) {
            for (Row r : batch) {
                values.add(r.getString(column));
            }
        }
        source.close();
        return values;
    }
}
