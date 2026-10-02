package com.sp.platform.components.excel;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Source;
import com.sp.platform.components.Params;
import com.sp.platform.components.shard.ShardUtils;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.openxml4j.opc.PackagePart;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.usermodel.XSSFRelation;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.DefaultHandler;
import org.xml.sax.helpers.XMLReaderFactory;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Excel 输入控件（.xlsx）：基于 POI XSSF SAX 事件模型流式遍历，不全量加载。
 * SAX 为推模型，故解析跑在独立虚拟线程，行数据经有界队列交给 poll()（天然背压）。
 *
 * <p><b>并行分片（设计文档 §7）</b>：xlsx 是 ZIP 压缩容器，sheet1.xml 被 deflate 压缩，
 * 无法像 CSV 那样按字节偏移随机定位，因此改用<b>行区间分片</b>：
 * <ol>
 *   <li>先读工作表首部的 {@code <dimension ref="A1:F10001"/>} 得到总行数（只读几百字节；
 *       该元素缺失时退回一次「只数 &lt;row&gt;、不解析单元格」的计数扫描）；</li>
 *   <li>按数据行序号均分为 N 段（不含表头），分片 i 只负责 {@code [total*i/N, total*(i+1)/N)}；</li>
 *   <li>每个分片仍从文件头顺序解析，但<b>不在自己区间内的行直接跳过</b>——不做单元格累积、
 *       不查共享字符串表、不入队；越过区间末尾立即中断解析。</li>
 * </ol>
 *
 * <p><b>不丢数据的保证</b>：区间首尾相接且从 0 起，末分片的上界不做截断（读到文件尾为止）。
 * 因此无论行数探测偏大还是偏小，每行恰好被一个分片处理，既不重复也不遗漏。
 *
 * <p><b>已知边界（如实说明）</b>：由于 xlsx 不可随机定位，分片无法减少「从头 tokenize 到
 * 自己区间末尾」的解析开销，所以 Excel 源的加速主要体现在处理与写出环节，输入侧 I/O
 * 不随分片数线性下降。表头行由每个分片各读一次（仅一行，开销可忽略）。
 *
 * <p>断点续传：{@link #progress()} 返回「下一待读数据行的序号」，由执行引擎持久化到分片
 * {@code progress}；重派后经 {@code resumeOffset} 传回，语义与 csv-source 的字节偏移一致。
 */
@ComponentDef(
        code = "excel-source",
        name = "Excel 输入",
        category = "SOURCE",
        description = "流式遍历 xlsx 文件（POI SAX 事件模型）；并行度>1 时按行区间切分",
        icon = "file-excel",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["path"],
                  "properties": {
                    "path":      {"type": "string",  "title": "文件路径(.xlsx)"},
                    "hasHeader": {"type": "boolean", "title": "首行为表头", "default": true},
                    "batchSize": {"type": "integer", "title": "批大小", "default": 5000}
                  }
                }
                """)
public class ExcelSource implements Source {

    private static final Object END = new Object();
    private static final Object ERROR = new Object();

    private OPCPackage pkg;
    private Thread parserThread;
    private ArrayBlockingQueue<Object> queue;
    private String[] header;
    private int batchSize;
    private boolean eof;
    private volatile boolean closed;
    private volatile Exception parseError;
    /** 本分片负责的数据行起始序号（0 起，不含表头），断点续传基线。 */
    private long startOrdinal;
    /** 已作为数据行产出的行数，用于计算断点。 */
    private long emittedRows;

    @Override
    public void open(Map<String, Object> params, Context ctx) throws Exception {
        String path = Params.required(params, "path");
        boolean hasHeader = Params.bool(params, "hasHeader", true);
        this.batchSize = Params.integer(params, "batchSize", 5000);
        // 分片参数由执行引擎强制注入（并行度=1 时为 0/1），用户表单无法篡改
        int shardIndex = Params.integer(params, "shardIndex", 0);
        int totalShards = Params.integer(params, "totalShards", 1);
        long resumeRow = Params.longVal(params, "resumeOffset", 0L);
        this.queue = new ArrayBlockingQueue<>(Math.max(batchSize, 1000));

        pkg = OPCPackage.open(path, org.apache.poi.openxml4j.opc.PackageAccess.READ);
        XSSFReader reader = new XSSFReader(pkg);
        // 共享字符串表用轻量实现 LightSharedStrings（只需 String，建表与取值都零额外包装对象）：
        // - POI 默认 SharedStringsTable 会为每条目构造 XSSFRichTextString，10 万行实测建表 ~1.0-1.7s，
        //   且每个分片都要重付一遍；
        // - POI 的 ReadOnlySharedStringsTable 建表只要 60ms，但 getItemAt() 每次都 new
        //   XSSFRichTextString，逐格取值又把时间吃回去。
        // 另外 sst 不是必需的：openpyxl 等写出器把字符串直接内联在单元格里
        // （无 /xl/sharedStrings.xml），故先按内容类型判断部件是否存在。
        LightSharedStrings sst = null;
        List<PackagePart> sstParts =
                pkg.getPartsByContentType(XSSFRelation.SHARED_STRINGS.getContentType());
        if (!sstParts.isEmpty()) {
            try (InputStream sstIn = sstParts.get(0).getInputStream()) {
                sst = LightSharedStrings.read(sstIn, 1024);
            }
        }

        long endOrdinal = Long.MAX_VALUE;
        if (totalShards > 1) {
            long totalRows = totalDataRows(reader, hasHeader, path);
            ShardUtils.RowRange range = ShardUtils.rowRange(totalRows, shardIndex, totalShards);
            this.startOrdinal = range.start();
            // 末分片不设上界：即使行数探测偏小也一直读到文件尾，保证不丢数据
            endOrdinal = shardIndex == totalShards - 1 ? Long.MAX_VALUE : range.endExclusive();
        }
        if (resumeRow > startOrdinal) {
            // 断点续传：行号由本组件在行边界记录，直接从断点行继续
            this.startOrdinal = resumeRow;
        }

        Iterator<InputStream> sheets = reader.getSheetsData();
        if (!sheets.hasNext()) {
            throw new IllegalArgumentException("xlsx 中不存在工作表: " + path);
        }
        InputStream sheet = sheets.next();

        XMLReader parser = XMLReaderFactory.createXMLReader();
        parser.setContentHandler(
                new SheetHandler(sst, queue, hasHeader, startOrdinal, endOrdinal));

        parserThread = Thread.ofVirtual().start(() -> {
            try (sheet) {
                parser.parse(new InputSource(sheet));
                putEnd();
            } catch (Exception e) {
                // 正常关闭：close() 中断了解析线程（或已关闭 pkg），不是解析失败，静默退出
                if (closed) {
                    return;
                }
                // 越过本分片区间而主动中断解析：本分片已读完，按正常结束收尾
                if (isRangeDone(e)) {
                    putEnd();
                    return;
                }
                parseError = e;
                try {
                    queue.put(ERROR);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
            }
        });
    }

    /** 断点续传：返回「下一待读数据行的序号」。引擎随上报持久化到分片 progress。 */
    @Override
    public long progress() {
        return startOrdinal + emittedRows;
    }

    @Override
    public List<Row> poll() throws Exception {
        if (eof) {
            return List.of();
        }
        List<Row> batch = new ArrayList<>(batchSize);
        while (batch.size() < batchSize) {
            Object item = queue.poll(1, TimeUnit.SECONDS);
            if (item == null) {
                if (closed) {
                    eof = true;
                    break;
                }
                continue;
            }
            if (item == END) {
                eof = true;
                break;
            }
            if (item == ERROR) {
                throw new IllegalStateException("Excel 解析失败", parseError);
            }
            @SuppressWarnings("unchecked")
            List<String> cells = (List<String>) item;
            if (header == null) {
                // 首行：表头（hasHeader=true）或无表头时由解析器补的伪表头 col_N
                header = cells.toArray(new String[0]);
                continue;
            }
            Map<String, Object> fields = new LinkedHashMap<>(cells.size() * 2);
            for (int i = 0; i < cells.size(); i++) {
                String name = i < header.length ? header[i] : "col_" + i;
                fields.put(name, cells.get(i));
            }
            batch.add(new Row(fields));
            emittedRows++;
        }
        return batch;
    }

    @Override
    public void close() {
        closed = true;
        if (parserThread != null) {
            parserThread.interrupt();
        }
        if (pkg != null) {
            try {
                pkg.close();
            } catch (Exception ignored) {
            }
        }
    }

    private void putEnd() {
        if (closed) {
            return;
        }
        try {
            queue.put(END);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // ==================== 行数探测（分片边界依据） ====================

    /** 数据行总数（不含表头）。优先读 {@code <dimension>}，缺失时退回纯计数扫描。 */
    private static long totalDataRows(XSSFReader reader, boolean hasHeader, String path) {
        long lastRow = peekLastRow(reader);
        if (lastRow <= 0) {
            lastRow = countRows(reader); // 兜底：只数 <row>，不解析任何单元格
            if (lastRow < 0) {
                throw new IllegalStateException(
                        "无法确定 xlsx 行数，不能安全分片（请将并行度设为 1）: " + path);
            }
        }
        return hasHeader ? Math.max(0, lastRow - 1) : lastRow;
    }

    /** 读工作表首部 {@code <dimension ref="A1:F10001"/>} 取末行行号；缺失或异常返回 -1。 */
    private static long peekLastRow(XSSFReader reader) {
        try (InputStream in = firstSheet(reader)) {
            XMLReader parser = XMLReaderFactory.createXMLReader();
            DimensionPeek peek = new DimensionPeek();
            parser.setContentHandler(peek);
            try {
                parser.parse(new InputSource(in));
            } catch (Exception ignored) {
                // 读到 dimension / sheetData 即以 RangeDone 提前结束，属正常路径
            }
            return peek.lastRow;
        } catch (Exception e) {
            return -1;
        }
    }

    /** 兜底行数：完整扫一遍 XML，只统计 {@code <row>} 个数（不碰单元格与共享串表）。失败返回 -1。 */
    private static long countRows(XSSFReader reader) {
        try (InputStream in = firstSheet(reader)) {
            XMLReader parser = XMLReaderFactory.createXMLReader();
            RowCounter counter = new RowCounter();
            parser.setContentHandler(counter);
            parser.parse(new InputSource(in));
            return counter.rows;
        } catch (Exception e) {
            return -1;
        }
    }

    private static InputStream firstSheet(XSSFReader reader) throws Exception {
        Iterator<InputStream> sheets = reader.getSheetsData();
        if (!sheets.hasNext()) {
            throw new IllegalArgumentException("xlsx 中不存在工作表");
        }
        return sheets.next();
    }

    /** "A1:F10001" → 10001；单格 "A1" → 1；无法解析返回 -1。 */
    static long lastRowOf(String ref) {
        if (ref == null || ref.isBlank()) {
            return -1;
        }
        int colon = ref.lastIndexOf(':');
        String tail = colon >= 0 ? ref.substring(colon + 1) : ref;
        long row = 0;
        boolean any = false;
        for (int i = 0; i < tail.length(); i++) {
            char c = tail.charAt(i);
            if (Character.isDigit(c)) {
                row = row * 10 + (c - '0');
                any = true;
            } else if (any) {
                break;
            }
        }
        return any ? row : -1;
    }

    /** 越过本分片区间时用于中断 SAX 解析的信号，不是错误。 */
    private static final class RangeDone extends RuntimeException {
        RangeDone() {
            super(null, null, false, false);
        }
    }

    private static boolean isRangeDone(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c instanceof RangeDone) {
                return true;
            }
        }
        return false;
    }

    /** 只读 {@code <dimension>}，读到即中断。 */
    private static final class DimensionPeek extends DefaultHandler {
        long lastRow = -1;

        @Override
        public void startElement(String uri, String localName, String qName, Attributes attributes) {
            if ("dimension".equals(qName)) {
                lastRow = lastRowOf(attributes.getValue("ref"));
                throw new RangeDone();
            }
            if ("sheetData".equals(qName)) {
                throw new RangeDone(); // 部分写出器省略 dimension，交给计数扫描兜底
            }
        }
    }

    /** 只数 {@code <row>} 元素，不做任何单元格解析。 */
    private static final class RowCounter extends DefaultHandler {
        long rows;

        @Override
        public void startElement(String uri, String localName, String qName, Attributes attributes) {
            if ("row".equals(qName)) {
                rows++;
            }
        }
    }

    // ==================== SAX 行解析 ====================

    /** SAX 行解析：完成一行即投递到队列；不在本分片区间内的行整体跳过。 */
    private static final class SheetHandler extends DefaultHandler {

        private final LightSharedStrings sst;
        private final ArrayBlockingQueue<Object> queue;
        private final boolean hasHeader;
        /** 本分片负责的数据行序号区间 [startOrdinal, endOrdinal)，序号 0 起、不含表头。 */
        private final long startOrdinal;
        private final long endOrdinal;

        private List<String> currentRow;
        private StringBuilder cellValue;
        private boolean inlineString;
        private boolean sharedString;
        private boolean firstRow = true;
        private int cellIndex;
        /** 当前行是否不在本分片区间内：跳过时既不解析单元格也不入队。 */
        private boolean skipping;
        /** 行缺少 r 属性时的自增行号兜底（1 起，与 Excel 行号一致）。 */
        private long fallbackRowNo;

        SheetHandler(LightSharedStrings sst, ArrayBlockingQueue<Object> queue, boolean hasHeader,
                     long startOrdinal, long endOrdinal) {
            this.sst = sst;
            this.queue = queue;
            this.hasHeader = hasHeader;
            this.startOrdinal = startOrdinal;
            this.endOrdinal = endOrdinal;
        }

        @Override
        public void startElement(String uri, String localName, String qName,
                                 Attributes attributes) {
            if ("row".equals(qName)) {
                long absRow = rowNumberOf(attributes);
                if (hasHeader && absRow == 1) {
                    // 表头行：列名与分片区间无关，每个分片都要读（仅一行，开销可忽略）
                    skipping = false;
                } else {
                    long ordinal = absRow - (hasHeader ? 2 : 1);
                    if (ordinal >= endOrdinal) {
                        throw new RangeDone(); // 越过本分片区间，提前终止解析
                    }
                    skipping = ordinal < startOrdinal;
                }
                currentRow = skipping ? null : new ArrayList<>();
                if (skipping) {
                    cellValue = null;
                }
                cellIndex = -1;
                return;
            }
            if (skipping) {
                return;
            }
            switch (qName) {
                case "c" -> {
                    cellValue = new StringBuilder();
                    String type = attributes.getValue("t");
                    sharedString = "s".equals(type);
                    inlineString = "inlineStr".equals(type);
                    String ref = attributes.getValue("r"); // 如 B3，用于补齐空单元格
                    if (ref != null) {
                        int col = 0;
                        for (int i = 0; i < ref.length(); i++) {
                            char ch = ref.charAt(i);
                            if (Character.isLetter(ch)) {
                                col = col * 26 + (ch - 'A' + 1);
                            } else {
                                break;
                            }
                        }
                        cellIndex = col - 1;
                    } else {
                        cellIndex++;
                    }
                }
                case "v", "t", "is" -> {
                    // 文本内容在 characters() 累积
                }
                default -> {
                }
            }
        }

        private long rowNumberOf(Attributes attributes) {            String r = attributes.getValue("r");
            if (r != null) {
                try {
                    fallbackRowNo = Long.parseLong(r);
                    return fallbackRowNo;
                } catch (NumberFormatException ignored) {
                    // 非法行号：退回自增
                }
            }
            return ++fallbackRowNo;
        }

        /** 共享串索引：非法/溢出返回 -1（后续按越界回退为原始文本）。 */
        private static int parseIndex(String raw) {
            try {
                return Integer.parseInt(raw.trim());
            } catch (NumberFormatException e) {
                return -1;
            }
        }

        @Override
        public void characters(char[] ch, int start, int length) {
            if (cellValue != null) {
                cellValue.append(ch, start, length);
            }
        }

        @Override
        public void endElement(String uri, String localName, String qName) {
            if ("row".equals(qName)) {
                List<String> row = currentRow;
                currentRow = null;
                skipping = false;
                if (row != null) {
                    enqueueRow(row);
                }
                return;
            }
            if (currentRow == null || cellValue == null) {
                return; // 被跳过的行：不解析单元格
            }
            if ("c".equals(qName)) {
                while (currentRow.size() < cellIndex) {
                    currentRow.add("");
                }
                String raw = cellValue.toString();
                String value;
                if (sharedString && sst != null) {
                    String looked = sst.entryAt(parseIndex(raw));
                    // 索引越界/脏数据：回退为原始文本
                    value = looked != null ? looked : raw;
                } else {
                    value = raw;
                }
                currentRow.add(value);
                cellValue = null;
                sharedString = false;
                inlineString = false;
            }
        }

        /**
         * 入队一行。无表头模式下首行需先补一行伪表头（col_N），否则 poll() 会把首行当列名丢掉；
         * 分片场景下每个分片各自补一次，保证各分片列名一致。
         */
        private void enqueueRow(List<String> row) {
            if (firstRow && !hasHeader) {
                firstRow = false;
                List<String> fake = new ArrayList<>(row.size());
                for (int i = 0; i < row.size(); i++) {
                    fake.add("col_" + i);
                }
                put(fake);
                put(row);
            } else {
                firstRow = false;
                put(row);
            }
        }

        private void put(List<String> row) {
            try {
                queue.put(row);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Excel 解析被中断", e);
            }
        }
    }
}
