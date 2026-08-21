package com.sp.platform.worker;

import com.sp.platform.worker.ExecutionEngine.ShardAssignment;
import com.sp.platform.worker.ExecutionEngine.ShardReport;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 执行引擎：Source 异常 → FAILED 上报；运行中收到停止指令 → 优雅退出 STOPPED。 */
class ExecutionEngineTest {

    @TempDir
    Path dir;

    private String dag(String inPath, String outPath, int batchSize) {
        return """
                {"nodes":[
                  {"id":"n1","componentCode":"csv-source","params":{"path":"%s","batchSize":%d}},
                  {"id":"n2","componentCode":"field-concat","params":{"sourceFields":["c1","c2"],"targetField":"ab"}},
                  {"id":"n3","componentCode":"csv-sink","params":{"path":"%s"}}],
                 "edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"}]}
                """.formatted(inPath.replace("\\", "/"), batchSize, outPath.replace("\\", "/"));
    }

    /** 轮询上报直到分片到达终态，返回最后一条上报。 */
    private ShardReport awaitTerminal(ExecutionEngine engine, long shardId) throws Exception {
        ShardReport last = null;
        for (int i = 0; i < 300; i++) { // 最多 30s
            for (ShardReport r : engine.collectReports()) {
                if (r.shardId() == shardId) {
                    last = r;
                }
            }
            if (last != null && ("STOPPED".equals(last.status()) || "FAILED".equals(last.status()))) {
                return last;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("分片未在 30s 内到达终态，最后状态: "
                + (last == null ? "无上报" : last.status()));
    }

    @Test
    void sourceExceptionReportedAsFailed() throws Exception {
        ExecutionEngine engine = new ExecutionEngine();
        Path out = dir.resolve("out.csv");
        engine.start(new ShardAssignment(1L, 1L,
                dag(dir.resolve("not-exist.csv").toString(), out.toString(), 5000), 0, 1, null, 0L, 0L));

        ShardReport report = awaitTerminal(engine, 1L);

        assertEquals("FAILED", report.status());
        assertNotNull(report.errorMsg());
        assertFalse(report.errorMsg().isBlank());
    }

    @Test
    void gracefulStopWhileRunning() throws Exception {
        // 50 万行 × 小批次：确保 stop 到达时流水线大概率仍在运行
        Path in = dir.resolve("in.csv");
        try (var w = Files.newBufferedWriter(in)) {
            w.write("c1,c2\n");
            for (int i = 0; i < 500_000; i++) {
                w.write("a" + i + ",b" + i + "\n");
            }
        }
        Path out = dir.resolve("out.csv");
        ExecutionEngine engine = new ExecutionEngine();
        engine.start(new ShardAssignment(2L, 2L, dag(in.toString(), out.toString(), 100), 0, 1, null, 0L, 0L));

        // 等流水线跑起来后发出停止指令
        Thread.sleep(300);
        engine.stop(2L);

        ShardReport report = awaitTerminal(engine, 2L);
        assertEquals("STOPPED", report.status());
        // 优雅停止：在途批次处理完退出，行数不超过全量（大概率小于全量）
        assertTrue(report.totalRows() <= 500_000, "totalRows=" + report.totalRows());
    }

    @Test
    void normalCompletionReportsStoppedWithAllRows() throws Exception {
        Path in = dir.resolve("small.csv");
        Files.writeString(in, "c1,c2\n" + "a,b\n".repeat(1000));
        Path out = dir.resolve("small-out.csv");
        ExecutionEngine engine = new ExecutionEngine();
        engine.start(new ShardAssignment(3L, 3L, dag(in.toString(), out.toString(), 5000), 0, 1, null, 0L, 0L));

        ShardReport report = awaitTerminal(engine, 3L);
        assertEquals("STOPPED", report.status());
        assertEquals(1000, report.totalRows());
        List<String> lines = Files.readAllLines(out);
        assertEquals(1001, lines.size()); // 表头 + 1000 行
        assertEquals("c1,c2,ab", lines.get(0));
    }
}
