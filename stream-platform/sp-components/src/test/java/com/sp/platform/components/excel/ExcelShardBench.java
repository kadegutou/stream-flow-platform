package com.sp.platform.components.excel;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.openxml4j.opc.PackageAccess;
import org.apache.poi.openxml4j.opc.PackagePart;
import org.apache.poi.xssf.eventusermodel.ReadOnlySharedStringsTable;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.model.SharedStrings;
import org.apache.poi.xssf.usermodel.XSSFRelation;
import org.apache.poi.xssf.usermodel.XSSFRow;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * 手动基准：Excel 源并行分片与共享字符串表的性能对照。
 *
 * <p><b>默认禁用</b>——性能数字随机器负载波动，不应进常规构建。需要复现时临时移除
 * {@code @Disabled} 再运行：
 * <pre>
 *   mvn -pl sp-components -am -Dtest=ExcelShardBench -Dsurefire.failIfNoSpecifiedTests=false test
 * </pre>
 *
 * <p>基准文件（10 万行 × 4 列，含约 30 万条唯一共享字符串）首次运行自动生成到
 * {@code target/bench100k.xlsx}，可用 {@code -Dsp.bench.file=...} 指定。
 * 对比「改造前」时，在改动前的代码上以相同口径跑 {@link #shardScaling()} 即可
 * （旧实现不读 shardIndex/totalShards，每个分片都会读全量）。
 */
@Disabled("手动基准，不进常规构建")
class ExcelShardBench {

    static final Path BENCH =
            Path.of(System.getProperty("sp.bench.file", "target/bench100k.xlsx"));

    private static Map<String, Object> params(int shardIndex, int totalShards) {
        Map<String, Object> m = new HashMap<>();
        m.put("path", BENCH.toString());
        m.put("shardIndex", shardIndex);
        m.put("totalShards", totalShards);
        return m;
    }

    /** 端到端（含 open()）读一遍，返回 [耗时ms, 行数]。 */
    private static long[] readAllOnce(int shardIndex, int totalShards) throws Exception {
        long t0 = System.nanoTime();
        ExcelSource src = new ExcelSource();
        src.open(params(shardIndex, totalShards), new Context(shardIndex, null, totalShards));
        long rows = 0;
        try {
            for (List<Row> b = src.poll(); !b.isEmpty(); b = src.poll()) {
                rows += b.size();
            }
        } finally {
            src.close();
        }
        long ms = (System.nanoTime() - t0) / 1_000_000;
        System.out.println("[bench] 端到端 分片" + shardIndex + "/" + totalShards
                + " 读到 " + rows + " 行, 耗时 " + ms + " ms");
        return new long[]{ms, rows};
    }

    private static void ensureBenchFile() throws Exception {
        if (Files.exists(BENCH)) {
            return;
        }
        Files.createDirectories(BENCH.toAbsolutePath().getParent());
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            XSSFSheet sheet = wb.createSheet("S");
            XSSFRow head = sheet.createRow(0);
            for (int c = 0; c < 4; c++) {
                head.createCell(c).setCellValue("col" + c);
            }
            for (int i = 1; i <= 100_000; i++) {
                XSSFRow r = sheet.createRow(i);
                r.createCell(0).setCellValue("uid-" + i);
                r.createCell(1).setCellValue("name-" + (i * 7919L % 100_003));
                r.createCell(2).setCellValue("city-" + (i % 331));
                r.createCell(3).setCellValue("tag-" + (i * 104729L % 99_991));
            }
            try (var out = Files.newOutputStream(BENCH)) {
                wb.write(out);
            }
        }
        System.out.println("[bench] 生成 " + BENCH + " (" + Files.size(BENCH) / 1024 + " KB)");
    }

    @Test
    void shardScaling() throws Exception {
        ensureBenchFile();
        System.out.println("[bench] 可用核数 = " + Runtime.getRuntime().availableProcessors());
        readAllOnce(0, 1);
        long best = Long.MAX_VALUE;
        for (int i = 0; i < 2; i++) {
            best = Math.min(best, readAllOnce(0, 1)[0]);
        }
        System.out.println("[bench] ===== 1 分片端到端: " + best + " ms =====");

        for (int shards : new int[]{2, 4}) {
            ExecutorService pool = Executors.newFixedThreadPool(shards);
            long t0 = System.nanoTime();
            List<Future<long[]>> fs = new ArrayList<>();
            for (int i = 0; i < shards; i++) {
                final int idx = i;
                final int n = shards;
                fs.add(pool.submit((Callable<long[]>) () -> readAllOnce(idx, n)));
            }
            long rows = 0;
            for (Future<long[]> f : fs) {
                rows += f.get()[1];
            }
            long ms = (System.nanoTime() - t0) / 1_000_000;
            pool.shutdown();
            System.out.println("[bench] ===== " + shards + " 分片端到端: " + ms + " ms, 合计 "
                    + rows + " 行（应等于 100000）, 加速比 "
                    + String.format("%.2fx", (double) best / ms) + " =====");
        }
    }

    @Test
    void sharedStringsTableCost() throws Exception {
        ensureBenchFile();
        for (int round = 1; round <= 3; round++) {
            long t0 = System.nanoTime();
            int full;
            try (OPCPackage pkg = OPCPackage.open(BENCH.toString(), PackageAccess.READ)) {
                SharedStrings sst = new XSSFReader(pkg).getSharedStringsTable();
                full = sst.getUniqueCount();
                sst.getItemAt(0).getString();
            }
            long msFull = (System.nanoTime() - t0) / 1_000_000;

            t0 = System.nanoTime();
            int ro;
            try (OPCPackage pkg = OPCPackage.open(BENCH.toString(), PackageAccess.READ)) {
                try (InputStream in = new XSSFReader(pkg).getSharedStringsData()) {
                    ReadOnlySharedStringsTable sst = new ReadOnlySharedStringsTable(in);
                    ro = sst.getUniqueCount();
                    sst.getItemAt(0).getString();
                }
            }
            long msRo = (System.nanoTime() - t0) / 1_000_000;

            t0 = System.nanoTime();
            int light;
            try (OPCPackage pkg = OPCPackage.open(BENCH.toString(), PackageAccess.READ)) {
                PackagePart part = pkg.getPartsByContentType(
                        XSSFRelation.SHARED_STRINGS.getContentType()).get(0);
                try (InputStream in = part.getInputStream()) {
                    LightSharedStrings sst = LightSharedStrings.read(in, 1024);
                    light = sst.size();
                    sst.entryAt(0);
                }
            }
            long msLight = (System.nanoTime() - t0) / 1_000_000;

            System.out.println("[bench] 建表 第" + round + "轮 唯一条目=" + full + "/" + ro + "/" + light
                    + "  POI默认=" + msFull + "ms  POI只读=" + msRo + "ms  自研=" + msLight + "ms");
        }
    }
}
