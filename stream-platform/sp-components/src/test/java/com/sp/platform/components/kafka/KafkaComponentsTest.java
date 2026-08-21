package com.sp.platform.components.kafka;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

/**
 * Kafka 控件测试。
 *
 * <p>TODO: 需要真实 Kafka 或 Testcontainers（当前环境无 Docker），留待集成环境补充：
 * <ul>
 *   <li>produce → consume round-trip（StringDeserializer）</li>
 *   <li>ENABLE_AUTO_COMMIT=false + 批次回执后 commitSync 的 at-least-once 语义验证</li>
 *   <li>consumer 宕机重启后从已提交 offset 续读、无丢失（允许重复）</li>
 * </ul>
 */
class KafkaComponentsTest {

    @Test
    @Disabled("需要真实 Kafka / Testcontainers，CI 无 Docker 时跳过")
    void produceConsumeRoundTrip() {
        // 占位，见类注释 TODO
    }
}
