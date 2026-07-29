package com.sp.platform.components.excel;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Sink;
import com.sp.platform.components.Params;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.xssf.streaming.SXSSFRow;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;

import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Excel 输出控件（.xlsx）：POI SXSSF 流式写，内存窗口 100 行。 */
@ComponentDef(
        code = "excel-sink",
        name = "Excel 输出",
        category = "SINK",
        description = "以 SXSSF 流式方式写出 xlsx 文件",
        icon = "file-excel",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["path"],
                  "properties": {
                    "path":      {"type": "string", "title": "文件路径(.xlsx)"},
                    "sheetName": {"type": "string", "title": "工作表名", "default": "Sheet1"}
                  }
                }
                """)
public class ExcelSink implements Sink {

    private String path;
    private SXSSFWorkbook workbook;
    private SXSSFSheet sheet;
    private List<String> columns;
    private int rowIndex;

    @Override
    public void open(Map<String, Object> params, Context ctx) {
        this.path = Params.required(params, "path");
        String sheetName = Params.str(params, "sheetName", "Sheet1");
        this.workbook = new SXSSFWorkbook(null, 100, false, true);
        this.sheet = workbook.createSheet(sheetName);
    }

    @Override
    public void write(List<Row> batch) {
        if (batch.isEmpty()) {
            return;
        }
        if (columns == null) {
            columns = new ArrayList<>(batch.get(0).fields().keySet());
            SXSSFRow header = sheet.createRow(rowIndex++);
            for (int i = 0; i < columns.size(); i++) {
                header.createCell(i).setCellValue(columns.get(i));
            }
        }
        for (Row row : batch) {
            SXSSFRow r = sheet.createRow(rowIndex++);
            for (int i = 0; i < columns.size(); i++) {
                Object v = row.fields().get(columns.get(i));
                if (v == null) {
                    continue;
                }
                Cell cell = r.createCell(i);
                if (v instanceof Number n) {
                    cell.setCellValue(n.doubleValue());
                } else if (v instanceof Boolean b) {
                    cell.setCellValue(b);
                } else {
                    cell.setCellValue(String.valueOf(v));
                }
            }
        }
    }

    @Override
    public void close() throws Exception {
        if (workbook != null) {
            try (FileOutputStream out = new FileOutputStream(path)) {
                workbook.write(out);
            }
            workbook.close();
            workbook.dispose();
        }
    }
}
