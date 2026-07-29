package com.sp.platform.components.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.common.spi.Sink;
import com.sp.platform.components.Params;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;

import java.util.List;
import java.util.Map;
import java.util.Properties;

/** Kafka 输出控件：批量 producer send，每行序列化为 JSON 对象字符串。 */
@ComponentDef(
        code = "kafka-sink",
        name = "Kafka 输出",
        category = "SINK",
        description = "将每行数据序列化为 JSON 批量写入 Kafka topic",
        icon = "message",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["bootstrapServers", "topic"],
                  "properties": {
                    "bootstrapServers": {"type": "string", "title": "Broker 列表"},
                    "topic":            {"type": "string", "title": "Topic"}
                  }
                }
                """)
public class KafkaSink implements Sink {

    private final ObjectMapper mapper = new ObjectMapper();

    private KafkaProducer<String, String> producer;
    private String topic;

    @Override
    public void open(Map<String, Object> params, Context ctx) {
        String bootstrapServers = Params.required(params, "bootstrapServers");
        this.topic = Params.required(params, "topic");

        Properties props = new Properties();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.LINGER_MS_CONFIG, "20"); // 批量发送

        producer = new KafkaProducer<>(props);
    }

    @Override
    public void write(List<Row> batch) throws Exception {
        for (Row row : batch) {
            String json = mapper.writeValueAsString(row.fields());
            producer.send(new ProducerRecord<>(topic, json));
        }
        producer.flush();
    }

    @Override
    public void close() {
        if (producer != null) {
            producer.close();
        }
    }
}
