package com.sp.platform.worker;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.dag.Dag;
import com.sp.platform.common.dag.DagValidator;
import com.sp.platform.common.dag.DagValidator.Pipeline;
import com.sp.platform.common.spi.AckAware;
import com.sp.platform.common.spi.Processor;
import com.sp.platform.common.spi.Sink;
import com.sp.platform.common.spi.Source;
import com.sp.platform.common.spi.StreamComponent;
import com.sp.platform.components.ComponentRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 执行引擎（设计文档 §5.2）：
 * Source 线程 poll() → ArrayBlockingQueue(64) → 处理线程过 Processor 链
 * → 扇出广播到 M 个 ArrayBlockingQueue(64) → M 个 Sink 线程并行 write()。
 *
 * <ul>
 *   <li>扇出（多路转发）：处理线程把每批依次 put 到所有 Sink 队列，最慢的 Sink 形成背压；
 *       EOF 毒丸广播到所有队列；全部 Sink 线程结束分片才算完成；任一 Sink 失败 → FAILED；</li>
 *   <li>at-least-once：一批被全部 Sink 写完才回调 AckAware（如 Kafka 提交位移）、
 *       累计 totalRows，并记录 Source.progress()（断点续传偏移）随上报持久化；</li>
 *   <li>fencing：上报携带 fenceToken，控制面校验不匹配则拒绝并通知停止；</li>
 *   <li>EOF 用毒丸批次传播终止；STOPPING 优雅停止（在途批次处理完再退出）。</li>
 * </ul>
 */
@Component
public class ExecutionEngine {

    private static final Logger log = LoggerFactory.getLogger(ExecutionEngine.class);
    private static final int QUEUE_CAPACITY = 64;

    /** 分片任务（控制面心跳下发的 assignment）。 */
    public record ShardAssignment(long shardId, long instanceId, String dagSnapshot,
                                  int shardIndex, int totalShards, String shardKey,
                                  long fenceToken, long resumeOffset) {
    }

    /** 分片上报项。 */
    public record ShardReport(long shardId, String status, long totalRows, long rowsPerSec,
                              String errorMsg, long fenceToken, long progress) {
    }

    private final Map<Long, ShardRunner> runners = new ConcurrentHashMap<>();

    /** 领取分片：同 fenceToken 重复下发则忽略；更高 fenceToken（重派）则中止旧执行并替换。 */
    public void start(ShardAssignment assignment) {
        ShardRunner existing = runners.get(assignment.shardId());
        if (existing != null && assignment.fenceToken() > existing.assignment.fenceToken()) {
            log.warn("分片 {} 收到更高 fenceToken（{} > {}），中止旧执行并替换",
                    assignment.shardId(), assignment.fenceToken(), existing.assignment.fenceToken());
            existing.abort();
            runners.remove(assignment.shardId(), existing);
        }
        runners.computeIfAbsent(assignment.shardId(), id -> {
            ShardRunner runner = new ShardRunner(assignment);
            Thread.ofVirtual().name("shard-" + id + "-main").start(runner::run);
            log.info("分片 {} (实例 {}) 启动, fenceToken={}, resumeOffset={}",
                    id, assignment.instanceId(), assignment.fenceToken(), assignment.resumeOffset());
            return runner;
        });
    }

    /** 优雅停止：停止拉新数据，在途批次处理完再退出。 */
    public void stop(long shardId) {
        ShardRunner runner = runners.get(shardId);
        if (runner != null) {
            log.info("分片 {} 收到停止指令", shardId);
            runner.requestStop();
        }
    }

    /** 立即中止（fencing 拒绝场景）：丢弃在途批次——新 owner 会从已确认断点重放，丢弃可避免双写。 */
    public void abort(long shardId) {
        ShardRunner runner = runners.get(shardId);
        if (runner != null) {
            log.warn("分片 {} 被 fencing 拒绝，立即中止", shardId);
            runner.abort();
        }
    }

    /** 收集上报项；终态分片在上报一次后从引擎移除。 */
    public List<ShardReport> collectReports() {
        List<ShardReport> reports = new ArrayList<>();
        for (ShardRunner runner : runners.values()) {
            reports.add(runner.snapshot());
            if (runner.isTerminal()) {
                if (runner.terminalReported) {
                    runners.remove(runner.assignment.shardId(), runner);
                }
                runner.terminalReported = true;
            }
        }
        return reports;
    }

    /** 单个分片的流水线。 */
    static final class ShardRunner {

        /**
         * 管道中传递的批次：rows + 完成计数（扇出时 = Sink 数）+ 写完回执 + 单调序号
         * + 读完该批时 Source 的偏移（endProgress）。
         * 全部 Sink 写完该批才累计行数并回调 ack（at-least-once）。
         * seq 从 1 起按 poll() 产生顺序递增，随批次原样传递到各 Sink，
         * 供 AckAware 按序对齐（扇出时完成顺序可能与产生顺序不一致）。
         */
        private record Batch(List<Row> rows, AtomicInteger pendingSinks, AckAware ack, long seq,
                             long endProgress) {
        }

        private static final Batch POISON = new Batch(null, null, null, 0L, -1L); // 毒丸（身份比较）

        private final ShardAssignment assignment;
        private final AtomicLong totalRows = new AtomicLong();

        private volatile boolean stopRequested;
        private volatile boolean aborted; // fencing 中止：各循环立即退出，在途批次丢弃
        private volatile boolean failed;
        private volatile String errorMsg;
        private volatile String status = "RUNNING";
        private volatile boolean terminalReported;

        private Source source;
        private final List<Sink> sinkList = new ArrayList<>();
        /**
         * 已确认断点：最后一批被【全部 Sink 写完】的批次对应的 Source 偏移。
         * 不能用 source.progress() 实时值——Source 会因队列缓冲预读，
         * 上报预读偏移会导致恢复时跳过未写出的行（静默丢数据）。-1 = 尚无可上报断点。
         */
        private final AtomicLong ackedProgress = new AtomicLong(-1);

        // 速率统计：两次上报间的增量 / 间隔
        private long lastSampleTime = System.currentTimeMillis();
        private long lastSampleTotal;

        ShardRunner(ShardAssignment assignment) {
            this.assignment = assignment;
        }

        void requestStop() {
            stopRequested = true;
            closeQuietly(source); // 唤醒阻塞中的 poll（如 Kafka wakeup），文件类 close 幂等无害
        }

        /** fencing 中止：比优雅停止更激进——处理/Sink 线程不再取新批次，尽快退出。 */
        void abort() {
            aborted = true;
            stopRequested = true;
            closeQuietly(source);
        }

        boolean isTerminal() {
            return "STOPPED".equals(status) || "FAILED".equals(status);
        }

        synchronized ShardReport snapshot() {
            long now = System.currentTimeMillis();
            long total = totalRows.get();
            long elapsed = Math.max(1, now - lastSampleTime);
            long rps = (total - lastSampleTotal) * 1000 / elapsed;
            lastSampleTime = now;
            lastSampleTotal = total;
            long progress = ackedProgress.get(); // 仅上报已确认偏移；-1 时控制面不更新
            return new ShardReport(assignment.shardId(), status, total, rps, errorMsg,
                    assignment.fenceToken(), progress);
        }

        void run() {
            List<Thread> sinkThreads = new ArrayList<>();
            Thread procThread = null;
            Thread sourceThread = null;
            try {
                Dag dag = DagValidator.fromJson(assignment.dagSnapshot());
                Pipeline pipeline = DagValidator.toPipeline(dag);
                List<Dag.Node> chain = pipeline.chain();
                Context ctx = new Context(assignment.shardIndex(), assignment.shardKey(),
                        assignment.totalShards());
                ComponentRegistry registry = ComponentRegistry.getInstance();

                source = (Source) instantiate(registry, chain.get(0), ctx);
                List<Processor> processors = new ArrayList<>();
                for (int i = 1; i < chain.size(); i++) {
                    processors.add((Processor) instantiate(registry, chain.get(i), ctx));
                }
                for (Dag.Node sinkNode : pipeline.sinks()) {
                    sinkList.add((Sink) instantiate(registry, sinkNode, ctx));
                }
                List<Sink> sinks = sinkList;
                AckAware ack = source instanceof AckAware a ? a : null;

                ArrayBlockingQueue<Batch> q1 = new ArrayBlockingQueue<>(QUEUE_CAPACITY);
                List<ArrayBlockingQueue<Batch>> sinkQueues = new ArrayList<>();
                for (int i = 0; i < sinks.size(); i++) {
                    sinkQueues.add(new ArrayBlockingQueue<>(QUEUE_CAPACITY));
                }

                // Source 线程：poll → q1；EOF 或停止 → 毒丸
                AtomicLong batchSeq = new AtomicLong(1); // 批次序号（仅 source 线程使用）
                sourceThread = Thread.ofVirtual().name("shard-" + assignment.shardId() + "-source")
                        .start(() -> {
                            try {
                                while (!stopRequested && !failed) {
                                    List<Row> rows = source.poll();
                                    if (rows.isEmpty()) {
                                        break; // EOF
                                    }
                                    // 读完本批后的 Source 偏移：该批被全部 Sink 写完后才允许上报为断点
                                    long endProgress;
                                    try {
                                        endProgress = source.progress();
                                    } catch (Exception e) {
                                        endProgress = -1;
                                    }
                                    Batch batch = new Batch(rows, new AtomicInteger(sinks.size()),
                                            ack, batchSeq.getAndIncrement(), endProgress);
                                    offerWhileRunning(q1, batch);
                                }
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            } catch (Exception e) {
                                // 优雅停止会 close source 唤醒阻塞中的 poll，
                                // 由此引发的异常（如 Stream closed）不算失败
                                if (!stopRequested) {
                                    markFailed(e);
                                }
                            } finally {
                                poisonAll(List.of(q1));
                            }
                        });
                // 处理线程：q1 → Processor 链 → 广播到所有 Sink 队列
                Thread proc = Thread.ofVirtual().name("shard-" + assignment.shardId() + "-process")
                        .start(() -> {
                            try {
                                while (!failed && !aborted) {
                                    Batch batch = q1.poll(100, TimeUnit.MILLISECONDS);
                                    if (batch == null) {
                                        continue;
                                    }
                                    if (batch == POISON) {
                                        break;
                                    }
                                    List<Row> rows = batch.rows();
                                    for (Processor p : processors) {
                                        rows = p.process(rows);
                                    }
                                    Batch out = new Batch(rows, batch.pendingSinks(), batch.ack(),
                                            batch.seq(), batch.endProgress());
                                    for (ArrayBlockingQueue<Batch> q : sinkQueues) {
                                        offerWhileRunning(q, out); // 逐个 put：最慢 Sink 形成背压
                                    }
                                }
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            } catch (Exception e) {
                                markFailed(e);
                            } finally {
                                poisonAll(sinkQueues); // EOF 毒丸广播
                            }
                        });
                procThread = proc;
                // Sink 线程（每 Sink 一个）：q → write；全部 Sink 写完才累计行数 + 回执
                for (int i = 0; i < sinks.size(); i++) {
                    Sink sink = sinks.get(i);
                    ArrayBlockingQueue<Batch> q = sinkQueues.get(i);
                    sinkThreads.add(Thread.ofVirtual()
                            .name("shard-" + assignment.shardId() + "-sink-" + i)
                            .start(() -> {
                                try {
                                    while (!failed && !aborted) {
                                        Batch batch = q.poll(100, TimeUnit.MILLISECONDS);
                                        if (batch == null) {
                                            continue;
                                        }
                                        if (batch == POISON) {
                                            break;
                                        }
                                        sink.write(batch.rows());
                                        // 全部 Sink 写完：累计行数 + 推进已确认断点 + at-least-once 回执
                                        if (batch.pendingSinks().decrementAndGet() == 0) {
                                            totalRows.addAndGet(batch.rows().size());
                                            if (batch.endProgress() >= 0) {
                                                ackedProgress.updateAndGet(
                                                        prev -> Math.max(prev, batch.endProgress()));
                                            }
                                            if (batch.ack() != null) {
                                                batch.ack().onBatchWritten(batch.seq());
                                            }
                                        }
                                    }
                                } catch (InterruptedException e) {
                                    Thread.currentThread().interrupt();
                                } catch (Exception e) {
                                    markFailed(e);
                                }
                            }));
                }

                for (Thread t : sinkThreads) {
                    t.join();
                }
                procThread.join();
                if (failed || stopRequested) {
                    sourceThread.interrupt(); // 失败/停止时源线程可能阻塞在满队列或 poll 上
                }
                sourceThread.join();
                status = failed ? "FAILED" : "STOPPED";
            } catch (Exception e) {
                markFailed(e);
                status = "FAILED";
            } finally {
                closeQuietly(source);
                for (Sink s : sinkList) {
                    closeQuietly(s);
                }
            }
            log.info("分片 {} 结束，状态 {}，共 {} 行", assignment.shardId(), status, totalRows.get());
        }

        /** 背压写入：队列满则等待，期间持续检查 失败/停止 标志避免死锁。 */
        private void offerWhileRunning(ArrayBlockingQueue<Batch> q, Batch batch)
                throws InterruptedException {
            while (!failed && !stopRequested) {
                if (q.offer(batch, 100, TimeUnit.MILLISECONDS)) {
                    return;
                }
            }
        }

        /** 毒丸广播（失败/中止时跳过，各线程靠标志位退出）。 */
        private void poisonAll(List<ArrayBlockingQueue<Batch>> queues) {
            if (failed || aborted) {
                return;
            }
            for (ArrayBlockingQueue<Batch> q : queues) {
                try {
                    q.put(POISON);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }

        private StreamComponent instantiate(ComponentRegistry registry, Dag.Node node, Context ctx)
                throws Exception {
            StreamComponent component = registry.create(node.componentCode());
            // 注入分片与断点续传参数：引擎值为权威，强制覆盖（防止用户表单篡改同名参数破坏分片）
            Map<String, Object> params = new java.util.HashMap<>(
                    node.params() == null ? Map.of() : node.params());
            params.put("shardIndex", assignment.shardIndex());
            params.put("totalShards", assignment.totalShards());
            if (assignment.resumeOffset() > 0) {
                params.put("resumeOffset", assignment.resumeOffset());
            }
            if (component instanceof Source s) {
                s.open(params, ctx);
            } else if (component instanceof Processor p) {
                p.open(params, ctx);
            } else if (component instanceof Sink k) {
                k.open(params, ctx);
            }
            return component;
        }

        private void markFailed(Exception e) {
            failed = true;
            errorMsg = e.getMessage() == null ? e.toString() : e.getMessage();
            log.error("分片 {} 执行异常: {}", assignment.shardId(), errorMsg, e);
        }

        private static void closeQuietly(AutoCloseable c) {
            if (c != null) {
                try {
                    c.close();
                } catch (Exception ignored) {
                    // 关闭失败不影响主流程
                }
            }
        }
    }
}
