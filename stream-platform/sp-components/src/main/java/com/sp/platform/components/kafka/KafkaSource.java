package com.sp.platform.components.kafka;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Source;
import com.sp.platform.components.Params;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.errors.WakeupException;
import org.apache.kafka.common.serialization.StringDeserializer;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

/**
 * Kafka 输入控件：批量 poll，消息体为 JSON 对象字符串（字段名→值）。
 * 说明：Kafka 是无界流，poll() 在无数据时阻塞等待（1s/次轮询），
 * 仅当 close()（优雅停止）触发 wakeup 后才返回空（EOF）。
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
public class KafkaSource implements Source {

    private final ObjectMapper mapper = new ObjectMapper();

    private KafkaConsumer<String, String> consumer;
    private int batchSize;
    private volatile boolean closed;

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
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "true");
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

        consumer = new KafkaConsumer<>(props);
        consumer.subscribe(List.of(topic));
    }

    @Override
    public List<Row> poll() throws Exception {
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
            records.forEach(record -> {
                try {
                    Map<String, Object> fields = mapper.readValue(
                            record.value(), new TypeReference<LinkedHashMap<String, Object>>() {
                            });
                    batch.add(new Row(fields));
                } catch (Exception e) {
                    throw new IllegalStateException("Kafka 消息不是合法 JSON: " + record.value(), e);
                }
            });
            return batch;
        }
        return List.of();
    }

    @Override
    public void close() {
        closed = true;
        if (consumer != null) {
            consumer.wakeup();
        }
    }
}
