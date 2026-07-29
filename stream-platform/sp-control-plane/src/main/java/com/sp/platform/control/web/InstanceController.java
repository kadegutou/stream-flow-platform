package com.sp.platform.control.web;

import com.sp.platform.control.repo.JobInstanceRepo;
import com.sp.platform.control.repo.JobMetricRepo;
import com.sp.platform.control.web.ApiExceptionHandler.ApiException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 实例监控：吞吐采样曲线。对应设计文档 §4.5。 */
@RestController
@RequestMapping("/api/instances")
public class InstanceController {

    private final JobInstanceRepo instanceRepo;
    private final JobMetricRepo metricRepo;

    public InstanceController(JobInstanceRepo instanceRepo, JobMetricRepo metricRepo) {
        this.instanceRepo = instanceRepo;
        this.metricRepo = metricRepo;
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
}
