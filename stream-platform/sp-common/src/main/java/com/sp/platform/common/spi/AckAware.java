package com.sp.platform.common.spi;

/**
 * 批次回执接口（可选实现）：Source 实现后，引擎在**一批数据被全部 Sink 写完之后**
 * 回调 {@link #onBatchWritten(long)}。用于 at-least-once 语义——例如 Kafka 位移
 * 只有在确认下游写完才允许提交。实现必须线程安全（由 Sink 线程调用）。
 *
 * <p>参数 batchSeq 是引擎为该分片按 poll() 产生顺序分配的单调递增序号（从 1 起）。
 * 扇出场景下各 Sink 消费速度不同，批次**完成顺序可能与产生顺序不一致**，实现方应
 * 按 batchSeq 对齐，只提交「连续完成前缀」的进度，避免把未完成批次的进度提前提交。
 */
public interface AckAware {

    /**
     * 一批数据已被所有 Sink 写完。
     *
     * @param batchSeq 该批在分片内的单调递增序号（从 1 起），与 poll() 返回顺序一致
     */
    void onBatchWritten(long batchSeq);
}
