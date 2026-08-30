package com.sp.platform.control.web;

import com.sp.platform.control.entity.JobInstanceEntity;
import com.sp.platform.control.entity.JobMetricEntity;
import com.sp.platform.control.entity.JobShardEntity;
import com.sp.platform.control.entity.WorkerNodeEntity;
import com.sp.platform.control.repo.JobInstanceRepo;
import com.sp.platform.control.repo.JobMetricRepo;
import com.sp.platform.control.repo.JobShardRepo;
import com.sp.platform.control.repo.WorkerNodeRepo;
import com.sp.platform.control.web.ApiExceptionHandler.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Worker 内部接口（/api/worker/**，X-Worker-Token 共享密钥认证，不走 JWT）。
 * 对应设计文档 §4.4 作业调度。
 */
@RestController
@RequestMapping("/api/worker")
public class WorkerInternalController {

    private static final Logger log = LoggerFactory.getLogger(WorkerInternalController.class);

    private final WorkerNodeRepo workerRepo;
    private final JobShardRepo shardRepo;
    private final JobInstanceRepo instanceRepo;
    private final JobMetricRepo metricRepo;

    public WorkerInternalController(WorkerNodeRepo workerRepo, JobShardRepo shardRepo,
                                    JobInstanceRepo instanceRepo, JobMetricRepo metricRepo) {
        this.workerRepo = workerRepo;
        this.shardRepo = shardRepo;
        this.instanceRepo = instanceRepo;
        this.metricRepo = metricRepo;
    }

    /** POST /register {nodeCode,address} → {workerId}（nodeCode 已存在则复用并置 ONLINE）。 */
    @PostMapping("/register")
    @Transactional
    public Map<String, Object> register(@RequestBody Map<String, Object> body) {
        String nodeCode = required(body, "nodeCode");
        String address = required(body, "address");
        WorkerNodeEntity worker = workerRepo.findByNodeCode(nodeCode).orElseGet(() -> {
            WorkerNodeEntity w = new WorkerNodeEntity();
            w.setNodeCode(nodeCode);
            return w;
        });
        worker.setAddress(address);
        worker.setStatus(WorkerNodeEntity.ONLINE);
        worker.setLastHeartbeat(LocalDateTime.now());
        return Map.of("workerId", workerRepo.save(worker).getId());
    }

    /**
     * POST /heartbeat {workerId} → {assignments:[...], stopShardIds:[...]}
     * assignments = 刚派给该 Worker 且 Worker 未确认（仍 PENDING）的分片；
     * stopShardIds = 该 Worker 名下状态为 STOPPING 的分片。
     */
    @PostMapping("/heartbeat")
    @Transactional
    public Map<String, Object> heartbeat(@RequestBody Map<String, Object> body) {
        WorkerNodeEntity worker = findWorker(body);
        worker.setLastHeartbeat(LocalDateTime.now());
        worker.setStatus(WorkerNodeEntity.ONLINE);
        workerRepo.save(worker);

        List<JobShardEntity> assigned = shardRepo.findByWorkerIdAndStatus(
                worker.getId(), JobInstanceEntity.PENDING);
        Map<Long, JobInstanceEntity> instanceCache = new HashMap<>();
        List<Map<String, Object>> assignments = new ArrayList<>();
        for (JobShardEntity shard : assigned) {
            JobInstanceEntity inst = instanceCache.computeIfAbsent(shard.getInstanceId(),
                    id -> instanceRepo.findById(id).orElseThrow());
            Map<String, Object> a = new LinkedHashMap<String, Object>();
            a.put("shardId", shard.getId());
            a.put("instanceId", inst.getId());
            a.put("dagSnapshot", inst.getDagSnapshot());
            a.put("shardIndex", shard.getShardIndex());
            a.put("totalShards", shardRepo.countByInstanceId(inst.getId()));
            a.put("shardKey", shard.getShardKey());
            a.put("fenceToken", shard.getFenceToken());
            a.put("resumeOffset", shard.getProgress()); // 断点续传：上次已读偏移
            assignments.add(a);
        }
        List<Long> stopShardIds = shardRepo.findByWorkerIdAndStatus(
                        worker.getId(), JobInstanceEntity.STOPPING)
                .stream().map(JobShardEntity::getId).toList();

        Map<String, Object> resp = new LinkedHashMap<String, Object>();
        resp.put("assignments", assignments);
        resp.put("stopShardIds", stopShardIds);
        return resp;
    }

    /**
     * POST /report {workerId, shards:[{shardId,status,totalRows,rowsPerSec,errorMsg,fenceToken,progress}]}
     * → {ok:true, abortShardIds:[...]}
     * 更新分片状态/行数/断点偏移，聚合更新 job_instance.total_rows，每次上报写一条 job_metric 采样。
     * fencing：上报 fenceToken 与分片当前值不匹配（分片已被重派他人）→ 拒绝该上报，
     * 并通过响应 abortShardIds 通知 Worker 立即中止本地执行。
     */
    @PostMapping("/report")
    @Transactional
    public Map<String, Object> report(@RequestBody Map<String, Object> body) {
        WorkerNodeEntity worker = findWorker(body);
        Object shardsObj = body.get("shards");
        List<?> shards = shardsObj instanceof List<?> l ? l : List.of();

        List<Long> rejected = new ArrayList<>();
        Map<Long, Long> rowsPerSecByInstance = new HashMap<>();
        Map<Long, String> errorByInstance = new HashMap<>();
        for (Object o : shards) {
            if (!(o instanceof Map<?, ?> s)) {
                continue;
            }
            long shardId = ((Number) s.get("shardId")).longValue();
            JobShardEntity shard = shardRepo.findById(shardId).orElse(null);
            if (shard == null || !worker.getId().equals(shard.getWorkerId())) {
                continue; // 分片已被重新派发，忽略过期上报
            }
            // fencing token 校验
            long reportToken = s.get("fenceToken") == null ? -1L
                    : ((Number) s.get("fenceToken")).longValue();
            if (reportToken != shard.getFenceToken()) {
                log.warn("拒绝过期 fenceToken 上报: shard={} report={} current={}",
                        shardId, reportToken, shard.getFenceToken());
                rejected.add(shardId);
                continue;
            }
            if (s.get("status") != null) {
                String to = String.valueOf(s.get("status"));
                if (validStatusTransition(shard.getStatus(), to)) {
                    shard.setStatus(to);
                } else {
                    log.warn("忽略非法分片状态迁移: shard={} {}→{}", shardId, shard.getStatus(), to);
                }
            }
            if (s.get("totalRows") != null) {
                shard.setTotalRows(((Number) s.get("totalRows")).longValue());
            }
            if (s.get("progress") != null) {
                long progress = ((Number) s.get("progress")).longValue();
                if (progress >= 0) {
                    shard.setProgress(progress); // 断点续传偏移
                }
            }
            shardRepo.save(shard);
            rowsPerSecByInstance.merge(shard.getInstanceId(),
                    s.get("rowsPerSec") == null ? 0L : ((Number) s.get("rowsPerSec")).longValue(),
                    Long::sum);
            if (JobInstanceEntity.FAILED.equals(shard.getStatus()) && s.get("errorMsg") != null) {
                errorByInstance.put(shard.getInstanceId(), String.valueOf(s.get("errorMsg")));
            }
        }

        // 聚合实例 total_rows + 写采样点（上报周期即采样周期，默认 5s）
        for (Map.Entry<Long, Long> e : rowsPerSecByInstance.entrySet()) {
            Long instanceId = e.getKey();
            instanceRepo.findById(instanceId).ifPresent(inst -> {
                long total = shardRepo.findByInstanceId(instanceId).stream()
                        .mapToLong(JobShardEntity::getTotalRows).sum();
                inst.setTotalRows(total);
                String err = errorByInstance.get(instanceId);
                if (err != null) {
                    inst.setErrorMsg(err.length() > 2000 ? err.substring(0, 2000) : err);
                }
                instanceRepo.save(inst);
                JobMetricEntity metric = new JobMetricEntity();
                metric.setInstanceId(instanceId);
                metric.setRowsPerSec(e.getValue());
                metric.setTotalRows(total);
                metricRepo.save(metric);
            });
        }
        Map<String, Object> resp = new LinkedHashMap<String, Object>();
        resp.put("ok", true);
        // fencing 拒绝的分片：新 owner 会从已确认断点重放，旧执行应立即中止（丢弃在途批次避免双写）
        resp.put("abortShardIds", rejected);
        return resp;
    }

    private WorkerNodeEntity findWorker(Map<String, Object> body) {
        Object workerId = body.get("workerId");
        if (workerId == null) {
            throw ApiException.badRequest("缺少参数: workerId");
        }
        return workerRepo.findById(((Number) workerId).longValue())
                .orElseThrow(() -> ApiException.notFound("Worker 不存在: " + workerId));
    }

    private static String required(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null || String.valueOf(v).isBlank()) {
            throw ApiException.badRequest("缺少参数: " + key);
        }
        return String.valueOf(v);
    }

    /**
     * 分片状态只允许正向迁移：终态不可再变；STOPPING 只能到 STOPPED/FAILED；
     * PENDING/RUNNING 只能到 RUNNING/STOPPED/FAILED（拒绝倒退，防止过期 RUNNING
     * 上报把 STOPPING/终态顶回 RUNNING）。
     */
    private static boolean validStatusTransition(String from, String to) {
        if (JobInstanceEntity.STOPPED.equals(from) || JobInstanceEntity.FAILED.equals(from)) {
            return false;
        }
        if (JobInstanceEntity.STOPPING.equals(from)) {
            return JobInstanceEntity.STOPPED.equals(to) || JobInstanceEntity.FAILED.equals(to);
        }
        return JobInstanceEntity.RUNNING.equals(to)
                || JobInstanceEntity.STOPPED.equals(to)
                || JobInstanceEntity.FAILED.equals(to);
    }
}
