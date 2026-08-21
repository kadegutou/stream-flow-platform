package com.sp.platform.components.excel;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Source;
import com.sp.platform.components.Params;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.model.SharedStrings;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
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
 */
@ComponentDef(
        code = "excel-source",
        name = "Excel 输入",
        category = "SOURCE",
        description = "流式遍历 xlsx 文件（POI SAX 事件模型）",
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

    @Override
    public void open(Map<String, Object> params, Context ctx) throws Exception {
        String path = Params.required(params, "path");
        boolean hasHeader = Params.bool(params, "hasHeader", true);
        this.batchSize = Params.integer(params, "batchSize", 5000);
        this.queue = new ArrayBlockingQueue<>(Math.max(batchSize, 1000));

        pkg = OPCPackage.open(path, org.apache.poi.openxml4j.opc.PackageAccess.READ);
        XSSFReader reader = new XSSFReader(pkg);
        SharedStrings sst = reader.getSharedStringsTable();
        Iterator<InputStream> sheets = reader.getSheetsData();
        if (!sheets.hasNext()) {
            throw new IllegalArgumentException("xlsx 中不存在工作表: " + path);
        }
        InputStream sheet = sheets.next();

        XMLReader parser = XMLReaderFactory.createXMLReader();
        parser.setContentHandler(new SheetHandler(sst, queue, hasHeader));

        parserThread = Thread.ofVirtual().start(() -> {
            try (sheet) {
                parser.parse(new InputSource(sheet));
                if (!closed) {
                    queue.put(END);
                }
            } catch (Exception e) {
                // 正常关闭：close() 中断了解析线程（或已关闭 pkg），不是解析失败，静默退出
                if (closed) {
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
                // 第一行：表头或无表头时的首行数据
                header = cells.toArray(new String[0]);
                if (cells.isEmpty()) {
                    continue;
                }
                // hasHeader=false 时该队列项已标记为数据行（见 SheetHandler），不会走到这里
                continue;
            }
            Map<String, Object> fields = new LinkedHashMap<>(cells.size() * 2);
            for (int i = 0; i < cells.size(); i++) {
                String name = i < header.length ? header[i] : "col_" + i;
                fields.put(name, cells.get(i));
            }
            batch.add(new Row(fields));
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

    /** SAX 行解析：完成一行即投递到队列。 */
    private static final class SheetHandler extends DefaultHandler {

        private final SharedStrings sst;
        private final ArrayBlockingQueue<Object> queue;
        private final boolean hasHeader;

        private List<String> currentRow;
        private StringBuilder cellValue;
        private boolean inlineString;
        private boolean sharedString;
        private boolean firstRow = true;
        private int cellIndex;

        SheetHandler(SharedStrings sst, ArrayBlockingQueue<Object> queue, boolean hasHeader) {
            this.sst = sst;
            this.queue = queue;
            this.hasHeader = hasHeader;
        }

        @Override
        public void startElement(String uri, String localName, String qName,
                                 Attributes attributes) {
            switch (qName) {
                case "row" -> {
                    currentRow = new ArrayList<>();
                    cellIndex = -1;
                }
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

        @Override
        public void characters(char[] ch, int start, int length) {
            if (cellValue != null) {
                cellValue.append(ch, start, length);
            }
        }

        @Override
        public void endElement(String uri, String localName, String qName) throws SAXException {
            switch (qName) {
                case "c" -> {
                    if (currentRow != null && cellValue != null) {
                        while (currentRow.size() < cellIndex) {
                            currentRow.add("");
                        }
                        String raw = cellValue.toString();
                        String value;
                        if (sharedString) {
                            try {
                                value = sst.getItemAt(Integer.parseInt(raw)).getString();
                            } catch (Exception e) {
                                value = raw;
                            }
                        } else {
                            value = raw;
                        }
                        currentRow.add(value);
                        cellValue = null;
                        sharedString = false;
                        inlineString = false;
                    }
                }
                case "row" -> {
                    if (currentRow != null) {
                        List<String> row = currentRow;
                        currentRow = null;
                        if (firstRow && !hasHeader) {
                            // 无表头：首行即数据，列名由 poll() 按 col_N 兜底。
                            // 这里把它作为"伪表头"会让首行丢失，因此直接作为数据行投递，
                            // 通过占位表头实现。
                            firstRow = false;
                            try {
                                // 先投伪表头（col_N），再投首行数据
                                List<String> fake = new ArrayList<>();
                                for (int i = 0; i < row.size(); i++) {
                                    fake.add("col_" + i);
                                }
                                queue.put(fake);
                                queue.put(row);
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                                throw new SAXException(e);
                            }
                        } else {
                            firstRow = false;
                            try {
                                queue.put(row);
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                                throw new SAXException(e);
                            }
                        }
                    }
                }
                default -> {
                }
            }
        }
    }
}
