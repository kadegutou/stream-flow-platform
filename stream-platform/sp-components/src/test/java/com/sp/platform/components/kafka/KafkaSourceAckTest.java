package com.sp.platform.components.kafka;

import com.sp.platform.components.kafka.KafkaSource.CommittablePrefix;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link KafkaSource#committablePrefix} 的 at-least-once 语义测试。
 * 扇出多 Sink 时批次完成顺序可能与产生顺序不一致（靠后批次先完成），
 * 该函数必须只提交「连续完成前缀」，绝不让未完成的前批被越过（否则崩溃重跑丢数据）。
 */
class KafkaSourceAckTest {

    private static final TopicPartition TP0 = new TopicPartition("t", 0);
    private static final TopicPartition TP1 = new TopicPartition("t", 1);

    /**
     * 构造 pending 表：批次 i（序号 i+1）→ 结束位移，每批含两个分区
     * （t-0 存 base，t-1 存 base*10），便于区分批次与验证分区内靠后位移覆盖靠前。
     */
    private static Map<Long, Map<TopicPartition, OffsetAndMetadata>> pending(long... bases) {
        Map<Long, Map<TopicPartition, OffsetAndMetadata>> m = new HashMap<>();
        for (int i = 0; i < bases.length; i++) {
            Map<TopicPartition, OffsetAndMetadata> b = new HashMap<>();
            b.put(TP0, new OffsetAndMetadata(bases[i]));
            b.put(TP1, new OffsetAndMetadata(bases[i] * 10));
            m.put(i + 1L, b);
        }
        return m;
    }

    private static Set<Long> completed(long... seqs) {
        Set<Long> s = new HashSet<>();
        for (long seq : seqs) {
            s.add(seq);
        }
        return s;
    }

    /** 正常顺序：1、2 都完成 → 一并提交，序号推进到 3。 */
    @Test
    void inOrderCommitsAll() {
        Map<Long, Map<TopicPartition, OffsetAndMetadata>> p = pending(10, 20);
        Set<Long> c = completed(1, 2);
        CommittablePrefix r = KafkaSource.committablePrefix(p, c, 1);
        assertEquals(3, r.nextExpectedSeq());
        assertEquals(2, r.offsets().size()); // t-0 + t-1
        assertEquals(20L, r.offsets().get(TP0).offset()); // 分区内靠后位移覆盖靠前
        assertEquals(200L, r.offsets().get(TP1).offset());
        assertTrue(p.isEmpty());
        assertTrue(c.isEmpty());
    }

    /** 乱序完成（回归场景）：批次 2 先完成但批次 1 未完成 → 不提交任何位移。 */
    @Test
    void outOfOrderDoesNotSkipIncompletePrefix() {
        Map<Long, Map<TopicPartition, OffsetAndMetadata>> p = pending(10, 20);
        Set<Long> c = completed(2); // 扇出下批次 2 被先写完
        CommittablePrefix r = KafkaSource.committablePrefix(p, c, 1);
        assertEquals(1, r.nextExpectedSeq()); // 批次 1 未完成，原地不动
        assertTrue(r.offsets().isEmpty());    // 绝不提前提交批次 2 的位移
        assertTrue(c.contains(2L));           // 批次 2 的确认保留，待 1 完成后一并提交
        // 批次 1 随后也完成 → 1、2 一起提交
        c.add(1L);
        CommittablePrefix r2 = KafkaSource.committablePrefix(p, c, r.nextExpectedSeq());
        assertEquals(3, r2.nextExpectedSeq());
        assertEquals(2, r2.offsets().size());
        assertEquals(20L, r2.offsets().get(TP0).offset());
    }

    /** 断层：1、3 完成，2 未完成 → 只提交 1，3 保留等待 2。 */
    @Test
    void gapStopsAtFirstIncomplete() {
        Map<Long, Map<TopicPartition, OffsetAndMetadata>> p = pending(10, 20, 30, 40);
        Set<Long> c = completed(1, 3);
        CommittablePrefix r = KafkaSource.committablePrefix(p, c, 1);
        assertEquals(2, r.nextExpectedSeq());
        assertEquals(2, r.offsets().size()); // 批次 1 的 t-0 + t-1
        assertEquals(10L, r.offsets().get(TP0).offset());
        assertEquals(100L, r.offsets().get(TP1).offset());
        assertTrue(c.contains(3L)); // 未触及的确认项保留
        assertEquals(3, p.size());  // 只移除批次 1 的位移
    }

    /** 无完成批次：不提交任何位移。 */
    @Test
    void nothingCompletedCommitsNothing() {
        Map<Long, Map<TopicPartition, OffsetAndMetadata>> p = pending(10, 20);
        Set<Long> c = completed();
        CommittablePrefix r = KafkaSource.committablePrefix(p, c, 1);
        assertEquals(1, r.nextExpectedSeq());
        assertTrue(r.offsets().isEmpty());
        assertEquals(2, p.size());
    }
}
