package com.sp.platform.control.service;

import com.sp.platform.control.entity.JobInstanceEntity;
import com.sp.platform.control.entity.JobShardEntity;
import com.sp.platform.control.entity.WorkerNodeEntity;
import com.sp.platform.control.repo.JobInstanceRepo;
import com.sp.platform.control.repo.JobShardRepo;
import com.sp.platform.control.repo.WorkerNodeRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 调度器（每 5s）。对应设计文档 §4.4 / §7：
 * 1. 心跳超时 Worker 置 OFFLINE，其分片重置 PENDING（故障自愈）；
 * 2. PENDING 分片按「RUNNING 分片数最少优先」派给 ONLINE Worker（乐观锁抢占）；
 * 3. 实例状态收敛。
 */
@Component
public class Scheduler {

    private static final Logger log = LoggerFactory.getLogger(Scheduler.class);

    private final WorkerNodeRepo workerRepo;
    private final JobShardRepo shardRepo;
    private final JobInstanceRepo instanceRepo;
    private final long heartbeatTimeoutMs;

    public Scheduler(WorkerNodeRepo workerRepo, JobShardRepo shardRepo,
                     JobInstanceRepo instanceRepo,
                     @Value("${sp.worker-heartbeat-timeout-ms:30000}") long heartbeatTimeoutMs) {
        this.workerRepo = workerRepo;
        this.shardRepo = shardRepo;
        this.instanceRepo = instanceRepo;
        this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    }

    @Scheduled(fixedDelayString = "${sp.scheduler.interval-ms:5000}", initialDelay = 5000)
    @Transactional
    public void tick() {
        handleWorkerTimeout();
        assignPendingShards();
        convergeInstances();
    }

    /** 心跳超时的 Worker 置 OFFLINE，其 RUNNING/PENDING 分片重置为待派发；STOPPING 分片置 STOPPED。 */
    void handleWorkerTimeout() {
        LocalDateTime deadline = LocalDateTime.now().minusNanos(heartbeatTimeoutMs * 1_000_000);
        for (WorkerNodeEntity w : workerRepo.findByStatusAndLastHeartbeatBefore(
                WorkerNodeEntity.ONLINE, deadline)) {
            log.warn("Worker 心跳超时，置 OFFLINE: {}({})", w.getNodeCode(), w.getId());
            w.setStatus(WorkerNodeEntity.OFFLINE);
            workerRepo.save(w);
            shardRepo.resetByWorker(w.getId());
            // STOPPING 分片若仍随 Worker 失联，直接置 STOPPED 避免下线状态机永久卡死
            int stopped = shardRepo.stopShardsByWorker(w.getId());
            if (stopped > 0) {
                log.warn("Worker {} 失联时仍有 {} 个 STOPPING 分片，已强制置 STOPPED", w.getId(), stopped);
            }
        }
    }

    /** PENDING 分片派给 ONLINE Worker（RUNNING 分片数最少优先），乐观锁抢占。 */
    void assignPendingShards() {
        List<JobShardEntity> pending = shardRepo.findByStatusAndWorkerIdIsNullOrderByIdAsc(
                JobInstanceEntity.PENDING);
        if (pending.isEmpty()) {
            return;
        }
        List<WorkerNodeEntity> workers = workerRepo.findByStatus(WorkerNodeEntity.ONLINE);
        if (workers.isEmpty()) {
            return;
        }
        // 负载 = 该 Worker 名下 RUNNING 分片数 + 本轮已新派分片数
        Map<Long, Long> load = new HashMap<>();
        List<Long> workerIds = workers.stream().map(WorkerNodeEntity::getId).toList();
        for (Object[] row : shardRepo.countRunningByWorkerIds(workerIds)) {
            load.put((Long) row[0], (Long) row[1]);
        }
        for (JobShardEntity shard : pending) {
            Long best = workers.stream().map(WorkerNodeEntity::getId)
                    .min(Comparator.comparingLong(id -> load.getOrDefault(id, 0L)))
                    .orElseThrow();
            if (shardRepo.assign(shard.getId(), best) == 1) {
                load.merge(best, 1L, Long::sum);
                log.info("分片 {} 派给 Worker {}", shard.getId(), best);
            }
        }
    }

    /**
     * 实例状态收敛：全分片 STOPPED → 实例 STOPPED(记 stoppedAt)；
     * 任一 FAILED → 实例 FAILED；存在 RUNNING → 实例 RUNNING(记 startedAt)。
     */
    void convergeInstances() {
        List<JobInstanceEntity> active = instanceRepo.findByStatusIn(List.of(
                JobInstanceEntity.PENDING, JobInstanceEntity.RUNNING, JobInstanceEntity.STOPPING));
        for (JobInstanceEntity inst : active) {
            List<JobShardEntity> shards = shardRepo.findByInstanceId(inst.getId());
            if (shards.isEmpty()) {
                continue;
            }
            boolean anyFailed = shards.stream()
                    .anyMatch(s -> JobInstanceEntity.FAILED.equals(s.getStatus()));
            boolean allStopped = shards.stream()
                    .allMatch(s -> JobInstanceEntity.STOPPED.equals(s.getStatus()));
            boolean anyRunning = shards.stream()
                    .anyMatch(s -> JobInstanceEntity.RUNNING.equals(s.getStatus()));
            if (anyFailed) {
                inst.setStatus(JobInstanceEntity.FAILED);
                inst.setStoppedAt(LocalDateTime.now());
                instanceRepo.save(inst);
            } else if (allStopped) {
                inst.setStatus(JobInstanceEntity.STOPPED);
                if (inst.getStoppedAt() == null) {
                    inst.setStoppedAt(LocalDateTime.now());
                }
                if (inst.getStartedAt() == null) {
                    // 作业在一个调度周期内完成，未观察到 RUNNING 中间态
                    inst.setStartedAt(inst.getStoppedAt());
                }
                instanceRepo.save(inst);
            } else if (anyRunning && !JobInstanceEntity.STOPPING.equals(inst.getStatus())) {
                inst.setStatus(JobInstanceEntity.RUNNING);
                if (inst.getStartedAt() == null) {
                    inst.setStartedAt(LocalDateTime.now());
                }
                instanceRepo.save(inst);
            }
        }
    }
}
