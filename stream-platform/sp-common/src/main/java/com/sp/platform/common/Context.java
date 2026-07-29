package com.sp.platform.common;

/**
 * 控件执行上下文：分片信息。对应设计文档 §7 作业分片。
 *
 * @param shardIndex  分片序号 0..N-1
 * @param shardKey    分片键（如 Kafka 分区号、文件偏移区间），未分片时为 null
 * @param totalShards 总分片数（并行度）
 */
public record Context(int shardIndex, String shardKey, int totalShards) {

    public static Context single() {
        return new Context(0, null, 1);
    }
}
