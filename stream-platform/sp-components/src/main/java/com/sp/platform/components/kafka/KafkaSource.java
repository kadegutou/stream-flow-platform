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
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Kafka 输入控件：批量 poll，消息体为 JSON 对象字符串（字段名→值）。
 * 说明：Kafka 是无界流，poll() 在无数据时阻塞等待（1s/次轮询），
 * 仅当 close()（优雅停止）触发 wakeup 后才返回空（EOF）。
 *
 * <p>at-least-once：关闭自动提交；每批的结束位移先入队，引擎在该批被所有 Sink
 * 写完后回调 {@link #onBatchWritten()}，位移到下一次 poll() 时才 commitSync
 * （KafkaConsumer 非线程安全，提交只能在 poll 线程做）。崩溃时未提交的批次会
 * 被重新消费——下游可能重复，Sink 侧不去重。
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
    /** 已 poll 但未确认写完的批次结束位移（FIFO，与批次的产生/完成顺序一致）。 */
    private final ConcurrentLinkedQueue<Map<TopicPartition, OffsetAndMetadata>> pendingOffsets =
            new ConcurrentLinkedQueue<>();
    /** 已确认写完、待提交的位移（poll 线程消费）。 */
    private final ConcurrentLinkedQueue<Map<TopicPartition, OffsetAndMetadata>> acknowledged =
            new ConcurrentLinkedQueue<>();

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
        commitAcknowledged(); // 上一批被 Sink 写完后才提交位移（at-least-once）
        while (!closed) {
            ConsumerRecords<String, String> records;
            try {
                records = consumer.poll(Duration.ofSeconds(1));
            } catch (WakeupException e) {
                return List.of(); // 优雅停止 → EOF
            }
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
            pendingOffsets.add(endOffsets);
            return batch;
        }
        return List.of();
    }

    /** 引擎回调：一批已被所有 Sink 写完。线程安全（Sink 线程调用）。 */
    @Override
    public void onBatchWritten() {
        Map<TopicPartition, OffsetAndMetadata> offsets = pendingOffsets.poll();
        if (offsets != null) {
            acknowledged.add(offsets);
        }
    }

    /** 在 poll 线程提交已确认位移（KafkaConsumer 非线程安全）。 */
    private void commitAcknowledged() {
        Map<TopicPartition, OffsetAndMetadata> merged = new HashMap<>();
        for (Map<TopicPartition, OffsetAndMetadata> m = acknowledged.poll(); m != null;
             m = acknowledged.poll()) {
            merged.putAll(m); // 批次有序产生，后面的位移覆盖前面的
        }
        if (!merged.isEmpty()) {
            consumer.commitSync(merged);
        }
    }

    @Override
    public void close() {
        closed = true;
        if (consumer != null) {
            consumer.wakeup();
        }
    }
}
