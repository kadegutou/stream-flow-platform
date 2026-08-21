package com.sp.platform.control.web;

import com.sp.platform.common.dag.Dag;
import com.sp.platform.common.dag.DagValidator;
import com.sp.platform.control.entity.JobEntity;
import com.sp.platform.control.entity.JobInstanceEntity;
import com.sp.platform.control.entity.JobShardEntity;
import com.sp.platform.control.repo.JobInstanceRepo;
import com.sp.platform.control.repo.JobMetricRepo;
import com.sp.platform.control.repo.JobRepo;
import com.sp.platform.control.repo.JobShardRepo;
import com.sp.platform.control.security.AuthFilters.JwtAuthFilter;
import com.sp.platform.control.web.ApiExceptionHandler.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 实例监控：吞吐采样曲线。对应设计文档 §4.5。 */
@RestController
@RequestMapping("/api/instances")
public class InstanceController {

    /** 覆盖写（truncate/overwrite）类 Sink：断点续读会与覆盖写冲突导致输出缺前段数据。 */
    private static final Set<String> OVERWRITE_SINKS = Set.of("csv-sink", "excel-sink", "hdfs-sink");

    private final JobInstanceRepo instanceRepo;
    private final JobMetricRepo metricRepo;
    private final JobShardRepo shardRepo;
    private final JobRepo jobRepo;

    public InstanceController(JobInstanceRepo instanceRepo, JobMetricRepo metricRepo,
                              JobShardRepo shardRepo, JobRepo jobRepo) {
        this.instanceRepo = instanceRepo;
        this.metricRepo = metricRepo;
        this.shardRepo = shardRepo;
        this.jobRepo = jobRepo;
    }

    /** GET /api/instances/{id}/metrics → [{rowsPerSec,totalRows,sampledAt}]（校验归属，防越权读他人实例） */
    @GetMapping("/{id}/metrics")
    public List<Map<String, Object>> metrics(@PathVariable Long id, HttpServletRequest req) {
        JobInstanceEntity inst = instanceRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("实例不存在: " + id));
        checkInstanceOwner(inst, req);
        return metricRepo.findByInstanceIdOrderBySampledAtAsc(id).stream().map(m -> {
            Map<String, Object> v = new LinkedHashMap<String, Object>();
            v.put("rowsPerSec", m.getRowsPerSec());
            v.put("totalRows", m.getTotalRows());
            v.put("sampledAt", m.getSampledAt());
            return v;
        }).toList();
    }

    /**
     * POST /api/instances/{id}/retry：失败重跑（断点续传）。
     * 仅 FAILED/STOPPED 实例可重跑：FAILED 分片重置为 PENDING（fenceToken+1、
     * worker 清空、progress 保留 → Worker 从断点续读，at-least-once），实例回到 PENDING。
     */
    @PostMapping("/{id}/retry")
    @Transactional
    public Map<String, Object> retry(@PathVariable Long id, HttpServletRequest req) {
        JobInstanceEntity inst = instanceRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("实例不存在: " + id));
        checkInstanceOwner(inst, req);
        if (!JobInstanceEntity.FAILED.equals(inst.getStatus())
                && !JobInstanceEntity.STOPPED.equals(inst.getStatus())) {
            throw ApiException.conflict("仅 FAILED/STOPPED 实例可重跑，当前: " + inst.getStatus());
        }
        // 覆盖写类 Sink 无法与断点续读组合：续读会跳过前段数据，而 Sink 覆盖写会丢前段 → 强制全量重跑
        boolean forceFullReset = hasOverwriteSink(inst.getDagSnapshot());
        int reset = 0;
        for (JobShardEntity shard : shardRepo.findByInstanceId(id)) {
            String prev = shard.getStatus();
            if (JobInstanceEntity.FAILED.equals(prev) || JobInstanceEntity.STOPPED.equals(prev)) {
                shard.setStatus(JobInstanceEntity.PENDING);
                shard.setWorkerId(null);
                shard.setFenceToken(shard.getFenceToken() + 1); // fencing：作废旧 Worker
                if (forceFullReset || JobInstanceEntity.STOPPED.equals(prev)) {
                    // 覆盖写 Sink 或正常停止实例：从头读，progress 清零；否则 FAILED 分片保留 progress 断点续读
                    shard.setProgress(0L);
                }
                shardRepo.save(shard);
                reset++;
            }
        }
        inst.setStatus(JobInstanceEntity.PENDING);
        inst.setErrorMsg(null);
        inst.setStoppedAt(null);
        instanceRepo.save(inst);
        Map<String, Object> resp = new LinkedHashMap<String, Object>();
        resp.put("ok", true);
        resp.put("resetShards", reset);
        return resp;
    }

    /** 归属校验：实例所属作业的 owner 或 ADMIN 可访问，否则 403（防 IDOR）。 */
    private void checkInstanceOwner(JobInstanceEntity inst, HttpServletRequest req) {
        JobEntity job = jobRepo.findById(inst.getJobId())
                .orElseThrow(() -> ApiException.notFound("作业不存在: " + inst.getJobId()));
        Long uid = (Long) req.getAttribute(JwtAuthFilter.ATTR_UID);
        boolean admin = "ADMIN".equals(req.getAttribute(JwtAuthFilter.ATTR_ROLE));
        if (!admin && !job.getOwnerId().equals(uid)) {
            throw ApiException.forbidden("无权操作他人作业");
        }
    }

    /** DAG 快照中是否含覆盖写类 Sink（csv/excel/hdfs 输出）。解析失败视为 true（保守全量重跑）。 */
    private static boolean hasOverwriteSink(String dagSnapshot) {
        try {
            Dag dag = DagValidator.fromJson(dagSnapshot);
            return DagValidator.toPipeline(dag).sinks().stream()
                    .anyMatch(n -> OVERWRITE_SINKS.contains(n.componentCode()));
        } catch (Exception e) {
            return true;
        }
    }
}
