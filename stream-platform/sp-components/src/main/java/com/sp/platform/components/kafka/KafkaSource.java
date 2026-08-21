package com.sp.platform.components.kafka;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.AckAware;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Source;
import com.sp.platform.components.Params;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.errors.WakeupException;
import org.apache.kafka.common.serialization.StringDeserializer;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentSkipListSet;

/**
 * Kafka 输入控件：批量 poll，消息体为 JSON 对象字符串（字段名→值）。
 * 说明：Kafka 是无界流，poll() 在无数据时阻塞等待（1s/次轮询），
 * 仅当 close()（优雅停止）触发 wakeup 后才返回空（EOF）。
 *
 * <p>at-least-once：关闭自动提交；每批的结束位移按序号登记，引擎在该批被所有
 * Sink 写完后回调 {@link #onBatchWritten(long)}（带批次序号），位移到下一次
 * poll() 时才 commitSync（KafkaConsumer 非线程安全，提交只能在 poll 线程做）。
 * 扇出多 Sink 时各批完成顺序可能乱序，因此只提交「连续完成前缀」——靠前批次未
 * 完成前不提交靠后批次，避免失败场景下丢数据。崩溃时未提交的批次会被重新消费，
 * 下游可能重复，Sink 侧不去重。
 */
@ComponentDef(
        code = "kafka-source",
        name = "Kafka 输入",
        category = "SOURCE",
        description = "从 Kafka topic 批量消费 JSON 消息",
        icon = "message",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["bootstrapServers", "topic", "groupId"],
                  "properties": {
                    "bootstrapServers": {"type": "string",  "title": "Broker 列表"},
                    "topic":            {"type": "string",  "title": "Topic"},
                    "groupId":          {"type": "string",  "title": "消费组"},
                    "batchSize":        {"type": "integer", "title": "批大小", "default": 5000}
                  }
                }
                """)
public class KafkaSource implements Source, AckAware {

    private final ObjectMapper mapper = new ObjectMapper();

    private KafkaConsumer<String, String> consumer;
    private int batchSize;
    private volatile boolean closed;
    /** 已 poll 但未确认写完的批次结束位移：批次序号 → 位移（序号从 1 起递增）。 */
    private final Map<Long, Map<TopicPartition, OffsetAndMetadata>> pendingOffsetsBySeq =
            new ConcurrentHashMap<>();
    /** 已确认写完的批次序号（Sink 线程写，poll 线程按序消费）。 */
    private final Set<Long> completedSeqs = new ConcurrentSkipListSet<>();
    /** 下一批次的序号（仅 poll 线程访问）。 */
    private long pollSeq = 1;
    /** 下一个待提交的批次序号（仅 poll 线程访问）；只提交连续完成前缀。 */
    private long expectedSeq = 1;

    @Override
    public void open(Map<String, Object> params, Context ctx) {
        String bootstrapServers = Params.required(params, "bootstrapServers");
        String topic = Params.required(params, "topic");
        String groupId = Params.required(params, "groupId");
        this.batchSize = Params.integer(params, "batchSize", 5000);

        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, batchSize);
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false"); // at-least-once：手动提交
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

        consumer = new KafkaConsumer<>(props);
        consumer.subscribe(List.of(topic));
    }

    @Override
    public List<Row> poll() throws Exception {
        try {
            while (!closed) {
                commitAcknowledged(); // 上一批被 Sink 写完后才提交位移（at-least-once）
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofSeconds(1));
                if (records.isEmpty()) {
                    continue; // 无界流：无数据继续等，不当 EOF
                }
                List<Row> batch = new ArrayList<>(records.count());
                Map<TopicPartition, OffsetAndMetadata> endOffsets = new HashMap<>();
                records.forEach(record -> {
                    endOffsets.put(new TopicPartition(record.topic(), record.partition()),
                            new OffsetAndMetadata(record.offset() + 1));
                    try {
                        Map<String, Object> fields = mapper.readValue(
                                record.value(), new TypeReference<LinkedHashMap<String, Object>>() {
                                });
                        batch.add(new Row(fields));
                    } catch (Exception e) {
                        throw new IllegalStateException("Kafka 消息不是合法 JSON: " + record.value(), e);
                    }
                });
                pendingOffsetsBySeq.put(pollSeq++, endOffsets);
                return batch;
            }
        } catch (WakeupException e) {
            // 优雅停止：close() 的 wakeup 打断 poll/commitSync，正常返回 EOF
        } finally {
            if (closed) {
                closeConsumer(); // KafkaConsumer 只能在 poll 线程关闭，这里即 source 线程
            }
        }
        return List.of();
    }

    /** 引擎回调：一批已被所有 Sink 写完（带批次序号）。线程安全（Sink 线程调用）。 */
    @Override
    public void onBatchWritten(long batchSeq) {
        completedSeqs.add(batchSeq);
    }

    /**
     * 在 poll 线程提交已确认位移（KafkaConsumer 非线程安全）。
     * 只提交「连续完成前缀」：自 expectedSeq 起，直到遇到第一个未完成批次为止。
     * 扇出场景下各 Sink 消费速度不同，靠后批次可能先完成——若直接提交会越过
     * 未完成的前批，崩溃重跑时跳过该批数据（丢数据）。按序提交前缀保证 at-least-once。
     */
    private void commitAcknowledged() {
        CommittablePrefix r = committablePrefix(pendingOffsetsBySeq, completedSeqs, expectedSeq);
        expectedSeq = r.nextExpectedSeq();
        if (!r.offsets().isEmpty()) {
            consumer.commitSync(r.offsets());
        }
    }

    /** 连续完成前缀的提交结果：推进后的下一个待提交序号 + 合并的位移。 */
    record CommittablePrefix(long nextExpectedSeq, Map<TopicPartition, OffsetAndMetadata> offsets) {
    }

    /**
     * 从已确认完成的批次集合中，计算自 expectedSeq 起**连续**完成的批次位移并合并。
     * 遇第一个未完成批次即停；已消费的确认项从集合移除，未触及的保留。
     * 纯函数（不触碰 KafkaConsumer），便于单测乱序完成场景。
     */
    static CommittablePrefix committablePrefix(
            Map<Long, Map<TopicPartition, OffsetAndMetadata>> pending,
            Set<Long> completed, long expectedSeq) {
        Map<TopicPartition, OffsetAndMetadata> merged = new HashMap<>();
        while (completed.remove(expectedSeq)) {
            Map<TopicPartition, OffsetAndMetadata> offsets = pending.remove(expectedSeq);
            if (offsets != null) {
                merged.putAll(offsets); // 批次有序产生，靠后的位移覆盖靠前的
            }
            expectedSeq++;
        }
        return new CommittablePrefix(expectedSeq, merged);
    }

    @Override
    public void close() {
        closed = true;
        KafkaConsumer<String, String> c = consumer;
        if (c != null) {
            c.wakeup(); // 唤醒 poll 线程；consumer 由 poll 线程在 closeConsumer() 中真正关闭
        }
    }

    /** 幂等关闭 consumer（仅由 poll 线程调用：KafkaConsumer 非线程安全）。 */
    private void closeConsumer() {
        KafkaConsumer<String, String> c = consumer;
        if (c == null) {
            return;
        }
        consumer = null;
        try {
            c.close(Duration.ofSeconds(3));
        } catch (Exception ignored) {
            // 关闭失败不影响主流程
        }
    }
}
