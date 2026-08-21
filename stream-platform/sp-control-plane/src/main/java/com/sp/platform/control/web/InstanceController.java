package com.sp.platform.control.web;

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

/** 实例监控：吞吐采样曲线。对应设计文档 §4.5。 */
@RestController
@RequestMapping("/api/instances")
public class InstanceController {

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

    /** GET /api/instances/{id}/metrics → [{rowsPerSec,totalRows,sampledAt}] */
    @GetMapping("/{id}/metrics")
    public List<Map<String, Object>> metrics(@PathVariable Long id) {
        if (!instanceRepo.existsById(id)) {
            throw ApiException.notFound("实例不存在: " + id);
        }
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
        // 归属校验：与作业操作一致（owner 或 ADMIN）
        JobEntity job = jobRepo.findById(inst.getJobId())
                .orElseThrow(() -> ApiException.notFound("作业不存在: " + inst.getJobId()));
        Long uid = (Long) req.getAttribute(JwtAuthFilter.ATTR_UID);
        boolean admin = "ADMIN".equals(req.getAttribute(JwtAuthFilter.ATTR_ROLE));
        if (!admin && !job.getOwnerId().equals(uid)) {
            throw ApiException.forbidden("无权操作他人作业");
        }
        if (!JobInstanceEntity.FAILED.equals(inst.getStatus())
                && !JobInstanceEntity.STOPPED.equals(inst.getStatus())) {
            throw ApiException.conflict("仅 FAILED/STOPPED 实例可重跑，当前: " + inst.getStatus());
        }
        int reset = 0;
        for (JobShardEntity shard : shardRepo.findByInstanceId(id)) {
            if (JobInstanceEntity.FAILED.equals(shard.getStatus())) {
                shard.setStatus(JobInstanceEntity.PENDING);
                shard.setWorkerId(null);
                shard.setFenceToken(shard.getFenceToken() + 1); // fencing：作废旧 Worker
                // progress 保留 → csv-source 从断点续读
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
}
