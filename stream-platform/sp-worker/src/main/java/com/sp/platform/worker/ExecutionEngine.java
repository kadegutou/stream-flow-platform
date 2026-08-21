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

    /** 领取分片：已存在则忽略（心跳可能重复下发同一 PENDING 分片）。 */
    public void start(ShardAssignment assignment) {
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
         * 管道中传递的批次：rows + 完成计数（扇出时 = Sink 数）+ 写完回执。
         * 全部 Sink 写完该批才累计行数并回调 ack（at-least-once）。
         */
        private record Batch(List<Row> rows, AtomicInteger pendingSinks, AckAware ack) {
        }

        private static final Batch POISON = new Batch(null, null, null); // 毒丸（身份比较）

        private final ShardAssignment assignment;
        private final AtomicLong totalRows = new AtomicLong();

        private volatile boolean stopRequested;
        private volatile boolean failed;
        private volatile String errorMsg;
        private volatile String status = "RUNNING";
        private volatile boolean terminalReported;

        private Source source;
        private final List<Sink> sinkList = new ArrayList<>();

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
            long progress = source == null ? -1 : source.progress();
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
                sourceThread = Thread.ofVirtual().name("shard-" + assignment.shardId() + "-source")
                        .start(() -> {
                            try {
                                while (!stopRequested && !failed) {
                                    List<Row> rows = source.poll();
                                    if (rows.isEmpty()) {
                                        break; // EOF
                                    }
                                    Batch batch = new Batch(rows, new AtomicInteger(sinks.size()), ack);
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
                                while (!failed) {
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
                                    Batch out = new Batch(rows, batch.pendingSinks(), batch.ack());
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
                                    while (!failed) {
                                        Batch batch = q.poll(100, TimeUnit.MILLISECONDS);
                                        if (batch == null) {
                                            continue;
                                        }
                                        if (batch == POISON) {
                                            break;
                                        }
                                        sink.write(batch.rows());
                                        // 全部 Sink 写完：累计行数 + at-least-once 回执
                                        if (batch.pendingSinks().decrementAndGet() == 0) {
                                            totalRows.addAndGet(batch.rows().size());
                                            if (batch.ack() != null) {
                                                batch.ack().onBatchWritten();
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

        /** 毒丸广播（失败时跳过，各线程靠 failed 标志退出）。 */
        private void poisonAll(List<ArrayBlockingQueue<Batch>> queues) {
            if (failed) {
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
            // 注入分片与断点续传参数：控件未显式指定时按分片任务信息注入
            Map<String, Object> params = new java.util.HashMap<>(
                    node.params() == null ? Map.of() : node.params());
            params.putIfAbsent("shardIndex", assignment.shardIndex());
            params.putIfAbsent("totalShards", assignment.totalShards());
            if (assignment.resumeOffset() > 0) {
                params.putIfAbsent("resumeOffset", assignment.resumeOffset());
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
