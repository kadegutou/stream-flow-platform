package com.sp.platform.common.dag;

import com.sp.platform.common.dag.Dag.Edge;
import com.sp.platform.common.dag.Dag.Node;
import com.sp.platform.common.spi.ComponentMeta;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DagValidatorTest {

    private static final ComponentMeta CSV_SOURCE = new ComponentMeta(
            "csv-source", "CSV输入", "SOURCE", "", "",
            "{\"type\":\"object\",\"required\":[\"path\"]}", "fake.CsvSource");
    private static final ComponentMeta CONCAT = new ComponentMeta(
            "field-concat", "字段拼接", "PROCESS", "", "",
            "{\"type\":\"object\",\"required\":[\"sourceFields\",\"targetField\"]}", "fake.Concat");
    private static final ComponentMeta CSV_SINK = new ComponentMeta(
            "csv-sink", "CSV输出", "SINK", "", "",
            "{\"type\":\"object\",\"required\":[\"path\"]}", "fake.CsvSink");

    private final DagValidator validator = new DagValidator(List.of(CSV_SOURCE, CONCAT, CSV_SINK));

    private static Dag chain() {
        return new Dag(List.of(
                new Node("n1", "csv-source", Map.of("path", "in.csv")),
                new Node("n2", "field-concat",
                        Map.of("sourceFields", List.of("A", "B"), "targetField", "C")),
                new Node("n3", "csv-sink", Map.of("path", "out.csv"))),
                List.of(new Edge("n1", "n2"), new Edge("n2", "n3")));
    }

    @Test
    void validChainPasses() {
        assertDoesNotThrow(() -> validator.validate(chain()));
    }

    @Test
    void cycleRejected() {
        Dag dag = new Dag(chain().nodes(),
                List.of(new Edge("n1", "n2"), new Edge("n2", "n3"), new Edge("n3", "n2")));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> validator.validate(dag));
        // 环上的 PROCESS 会因入边数=2 被拒，SINK 会因有后继被拒，均合法
        assertTrue(e.getMessage().contains("SINK") || e.getMessage().contains("环")
                || e.getMessage().contains("入边"), e.getMessage());
    }

    @Test
    void missingSourceRejected() {
        Dag dag = new Dag(List.of(
                new Node("n2", "field-concat",
                        Map.of("sourceFields", List.of("A"), "targetField", "C")),
                new Node("n3", "csv-sink", Map.of("path", "out.csv"))),
                List.of(new Edge("n2", "n3")));
        assertThrows(IllegalArgumentException.class, () -> validator.validate(dag));
    }

    @Test
    void missingSinkRejected() {
        Dag dag = new Dag(List.of(
                new Node("n1", "csv-source", Map.of("path", "in.csv")),
                new Node("n2", "field-concat",
                        Map.of("sourceFields", List.of("A"), "targetField", "C"))),
                List.of(new Edge("n1", "n2")));
        assertThrows(IllegalArgumentException.class, () -> validator.validate(dag));
    }

    @Test
    void sourceWithPredecessorRejected() {
        Dag dag = new Dag(List.of(
                new Node("n0", "csv-sink", Map.of("path", "x.csv")),
                new Node("n1", "csv-source", Map.of("path", "in.csv")),
                new Node("n3", "csv-sink", Map.of("path", "out.csv"))),
                List.of(new Edge("n0", "n1"), new Edge("n1", "n3")));
        // n0 是 SINK 有后继 或 n1 是 SOURCE 有前驱，均应拒绝
        assertThrows(IllegalArgumentException.class, () -> validator.validate(dag));
    }

    @Test
    void missingRequiredParamRejected() {
        Dag dag = new Dag(List.of(
                new Node("n1", "csv-source", Map.of()), // 缺 path
                new Node("n3", "csv-sink", Map.of("path", "out.csv"))),
                List.of(new Edge("n1", "n3")));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> validator.validate(dag));
        assertTrue(e.getMessage().contains("path"));
    }

    @Test
    void unknownComponentRejected() {
        Dag dag = new Dag(List.of(
                new Node("n1", "not-exist", Map.of()),
                new Node("n3", "csv-sink", Map.of("path", "out.csv"))),
                List.of(new Edge("n1", "n3")));
        assertThrows(IllegalArgumentException.class, () -> validator.validate(dag));
    }

    @Test
    void multiSinkFanoutAccepted() {
        // 扇出广播：链尾连多个 SINK 是合法的（多路转发）
        Dag dag = new Dag(List.of(
                new Node("n1", "csv-source", Map.of("path", "in.csv")),
                new Node("n2", "field-concat",
                        Map.of("sourceFields", List.of("A"), "targetField", "C")),
                new Node("n3", "csv-sink", Map.of("path", "a.csv")),
                new Node("n4", "csv-sink", Map.of("path", "b.csv"))),
                List.of(new Edge("n1", "n2"), new Edge("n2", "n3"), new Edge("n2", "n4")));
        assertDoesNotThrow(() -> validator.validate(dag));
    }

    @Test
    void directSourceFanoutAccepted() {
        // 无 PROCESS：SOURCE 直接扇出到多个 SINK
        Dag dag = new Dag(List.of(
                new Node("n1", "csv-source", Map.of("path", "in.csv")),
                new Node("n3", "csv-sink", Map.of("path", "a.csv")),
                new Node("n4", "csv-sink", Map.of("path", "b.csv"))),
                List.of(new Edge("n1", "n3"), new Edge("n1", "n4")));
        assertDoesNotThrow(() -> validator.validate(dag));
    }

    @Test
    void sinksWithDifferentPredecessorsRejected() {
        // sinkB 的前驱不是链尾 → 拒绝
        Dag dag = new Dag(List.of(
                new Node("n1", "csv-source", Map.of("path", "in.csv")),
                new Node("n2", "field-concat",
                        Map.of("sourceFields", List.of("A"), "targetField", "C")),
                new Node("n3", "csv-sink", Map.of("path", "a.csv")),
                new Node("n4", "csv-sink", Map.of("path", "b.csv"))),
                List.of(new Edge("n1", "n2"), new Edge("n2", "n3"), new Edge("n1", "n4")));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> validator.validate(dag));
        // SOURCE 同时连 PROCESS 和 SINK：属于分支，拒绝
        assertTrue(e.getMessage().contains("分支") || e.getMessage().contains("链尾"),
                e.getMessage());
    }

    @Test
    void branchRejected() {
        // n2 分出两条出边（一条到 PROCESS n3、一条到 SINK n4）：明确报“暂不支持分支”
        Dag dag = new Dag(List.of(
                new Node("n1", "csv-source", Map.of("path", "in.csv")),
                new Node("n2", "field-concat",
                        Map.of("sourceFields", List.of("A"), "targetField", "C")),
                new Node("n3", "field-concat",
                        Map.of("sourceFields", List.of("A"), "targetField", "D")),
                new Node("n4", "csv-sink", Map.of("path", "out.csv")),
                new Node("n5", "csv-sink", Map.of("path", "out2.csv"))),
                List.of(new Edge("n1", "n2"), new Edge("n2", "n3"), new Edge("n2", "n4"),
                        new Edge("n3", "n5")));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> validator.validate(dag));
        assertTrue(e.getMessage().contains("暂不支持分支"), e.getMessage());
        assertTrue(e.getMessage().contains("n2"), e.getMessage());
    }

    @Test
    void sourceWithoutOutEdgeRejected() {
        Dag dag = new Dag(List.of(
                new Node("n1", "csv-source", Map.of("path", "in.csv")),
                new Node("n3", "csv-sink", Map.of("path", "out.csv"))),
                List.of()); // 无边
        assertThrows(IllegalArgumentException.class, () -> validator.validate(dag));
    }

    @Test
    void disconnectedProcessRejected() {
        // 主链完整，但有一个悬空的 PROCESS（入边出边都非法）
        Dag dag = new Dag(List.of(
                new Node("n1", "csv-source", Map.of("path", "in.csv")),
                new Node("n3", "csv-sink", Map.of("path", "out.csv")),
                new Node("n9", "field-concat",
                        Map.of("sourceFields", List.of("A"), "targetField", "C"))),
                List.of(new Edge("n1", "n3")));
        assertThrows(IllegalArgumentException.class, () -> validator.validate(dag));
    }

    @Test
    void linearChainOrder() {
        DagValidator.Pipeline p = DagValidator.toPipeline(chain());
        assertTrue(p.chain().get(0).id().equals("n1")
                && p.chain().get(1).id().equals("n2")
                && p.sinks().size() == 1
                && p.sinks().get(0).id().equals("n3"));
    }

    @Test
    void pipelineWithFanout() {
        Dag dag = new Dag(List.of(
                new Node("n1", "csv-source", Map.of("path", "in.csv")),
                new Node("n2", "field-concat",
                        Map.of("sourceFields", List.of("A"), "targetField", "C")),
                new Node("n3", "csv-sink", Map.of("path", "a.csv")),
                new Node("n4", "csv-sink", Map.of("path", "b.csv"))),
                List.of(new Edge("n1", "n2"), new Edge("n2", "n3"), new Edge("n2", "n4")));
        DagValidator.Pipeline p = DagValidator.toPipeline(dag);
        assertEquals(2, p.chain().size());
        assertEquals(2, p.sinks().size());
    }
}
