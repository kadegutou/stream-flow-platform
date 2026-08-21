package com.sp.platform.common.spi;

/**
 * 批次回执接口（可选实现）：Source 实现后，引擎在**一批数据被全部 Sink 写完之后**
 * 回调 {@link #onBatchWritten()}。用于 at-least-once 语义——例如 Kafka 位移
 * 只有在确认下游写完才允许提交。实现必须线程安全（由 Sink 线程调用）。
 */
public interface AckAware {

    /** 一批数据已被所有 Sink 写完。调用顺序与 poll() 返回批次的顺序一致。 */
    void onBatchWritten();
}
