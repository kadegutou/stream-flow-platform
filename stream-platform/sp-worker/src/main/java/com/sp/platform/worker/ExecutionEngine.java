package com.sp.platform.worker;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.dag.Dag;
import com.sp.platform.common.dag.DagValidator;
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
import java.util.concurrent.atomic.AtomicLong;

/**
 * 执行引擎（设计文档 §5.2）：
 * Source 线程 poll() → ArrayBlockingQueue(64) → 处理线程过 Processor 链
 * → ArrayBlockingQueue(64) → Sink 线程 write()。
 * EOF 用毒丸批次传播终止；STOPPING 优雅停止（停止拉新数据，在途批次处理完再退出）。
 * 三段各占一个 JDK 21 虚拟线程，队列满即天然背压。
 */
@Component
public class ExecutionEngine {

    private static final Logger log = LoggerFactory.getLogger(ExecutionEngine.class);
    private static final int QUEUE_CAPACITY = 64;

    /** 分片任务（控制面心跳下发的 assignment）。 */
    public record ShardAssignment(long shardId, long instanceId, String dagSnapshot,
                                  int shardIndex, int totalShards, String shardKey) {
    }

    /** 分片上报项。 */
    public record ShardReport(long shardId, String status, long totalRows,
                              long rowsPerSec, String errorMsg) {
    }

    private final Map<Long, ShardRunner> runners = new ConcurrentHashMap<>();

    /** 领取分片：已存在则忽略（心跳可能重复下发同一 PENDING 分片）。 */
    public void start(ShardAssignment assignment) {
        runners.computeIfAbsent(assignment.shardId(), id -> {
            ShardRunner runner = new ShardRunner(assignment);
            Thread.ofVirtual().name("shard-" + id + "-main").start(runner::run);
            log.info("分片 {} (实例 {}) 启动", id, assignment.instanceId());
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

        private static final List<Row> POISON = List.of(); // 毒丸批次（身份比较）

        private final ShardAssignment assignment;
        private final AtomicLong totalRows = new AtomicLong();

        private volatile boolean stopRequested;
        private volatile boolean failed;
        private volatile String errorMsg;
        private volatile String status = "RUNNING";
        private volatile boolean terminalReported;

        private Source source;
        private Sink sink;
        private List<Processor> processors = List.of();

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
            return new ShardReport(assignment.shardId(), status, total, rps, errorMsg);
        }

        void run() {
            Thread sinkThread = null;
            Thread procThread = null;
            Thread sourceThread = null;
            try {
                Dag dag = DagValidator.fromJson(assignment.dagSnapshot());
                List<Dag.Node> chain = DagValidator.toLinearChain(dag);
                Context ctx = new Context(assignment.shardIndex(), assignment.shardKey(),
                        assignment.totalShards());
                ComponentRegistry registry = ComponentRegistry.getInstance();

                source = (Source) instantiate(registry, chain.get(0), ctx);
                List<Processor> ps = new ArrayList<>();
                for (int i = 1; i < chain.size() - 1; i++) {
                    ps.add((Processor) instantiate(registry, chain.get(i), ctx));
                }
                processors = ps;
                sink = (Sink) instantiate(registry, chain.get(chain.size() - 1), ctx);

                ArrayBlockingQueue<List<Row>> q1 = new ArrayBlockingQueue<>(QUEUE_CAPACITY);
                ArrayBlockingQueue<List<Row>> q2 = new ArrayBlockingQueue<>(QUEUE_CAPACITY);

                // Source 线程：poll → q1；EOF 或停止 → 毒丸
                sourceThread = Thread.ofVirtual().name("shard-" + assignment.shardId() + "-source")
                        .start(() -> {
                            try {
                                while (!stopRequested && !failed) {
                                    List<Row> batch = source.poll();
                                    if (batch.isEmpty()) {
                                        break; // EOF
                                    }
                                    q1.put(batch);
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
                                q1.offer(POISON);
                            }
                        });
                // 处理线程：q1 → Processor 链 → q2
                procThread = Thread.ofVirtual().name("shard-" + assignment.shardId() + "-process")
                        .start(() -> {
                            try {
                                while (true) {
                                    List<Row> batch = q1.take();
                                    if (batch == POISON) {
                                        break;
                                    }
                                    for (Processor p : processors) {
                                        batch = p.process(batch);
                                    }
                                    q2.put(batch);
                                }
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            } catch (Exception e) {
                                markFailed(e);
                            } finally {
                                q2.offer(POISON);
                            }
                        });
                // Sink 线程：q2 → write，统计行数
                sinkThread = Thread.ofVirtual().name("shard-" + assignment.shardId() + "-sink")
                        .start(() -> {
                            try {
                                while (true) {
                                    List<Row> batch = q2.take();
                                    if (batch == POISON) {
                                        break;
                                    }
                                    sink.write(batch);
                                    totalRows.addAndGet(batch.size());
                                }
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            } catch (Exception e) {
                                markFailed(e);
                            }
                        });

                sinkThread.join();
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
                closeQuietly(sink);
            }
            log.info("分片 {} 结束，状态 {}，共 {} 行", assignment.shardId(), status, totalRows.get());
        }

        private StreamComponent instantiate(ComponentRegistry registry, Dag.Node node, Context ctx)
                throws Exception {
            StreamComponent component = registry.create(node.componentCode());
            // 注入分片参数：控件未显式指定 shardIndex/totalShards 时，按分片任务信息注入，
            // 使所有控件（csv/hdfs 字节切片、kafka 分区过滤等）都能感知分片
            Map<String, Object> params = new java.util.HashMap<>(
                    node.params() == null ? Map.of() : node.params());
            params.putIfAbsent("shardIndex", assignment.shardIndex());
            params.putIfAbsent("totalShards", assignment.totalShards());
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
