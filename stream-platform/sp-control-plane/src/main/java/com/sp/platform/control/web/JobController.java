package com.sp.platform.control.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sp.platform.common.dag.DagValidator;
import com.sp.platform.components.ComponentRegistry;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 作业 CRUD、DAG 校验、上线/下线、实例查询。对应设计文档 §4.3 / §4.4。 */
@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final List<String> ACTIVE = List.of(
            JobInstanceEntity.PENDING, JobInstanceEntity.RUNNING, JobInstanceEntity.STOPPING);

    private final JobRepo jobRepo;
    private final JobInstanceRepo instanceRepo;
    private final JobShardRepo shardRepo;
    private final JobMetricRepo metricRepo;

    public JobController(JobRepo jobRepo, JobInstanceRepo instanceRepo,
                         JobShardRepo shardRepo, JobMetricRepo metricRepo) {
        this.jobRepo = jobRepo;
        this.instanceRepo = instanceRepo;
        this.shardRepo = shardRepo;
        this.metricRepo = metricRepo;
    }

    private static Long uid(HttpServletRequest req) {
        return (Long) req.getAttribute(JwtAuthFilter.ATTR_UID);
    }

    private static boolean isAdmin(HttpServletRequest req) {
        return "ADMIN".equals(req.getAttribute(JwtAuthFilter.ATTR_ROLE));
    }

    /** DAG 校验：无环、恰好 1 SOURCE / 1 SINK、SOURCE 无前驱、SINK 无后继、必填参数齐。 */
    private static String validateAndSerializeDag(Object dag) {
        if (dag == null) {
            throw ApiException.badRequest("缺少 dag 定义");
        }
        String json;
        try {
            json = MAPPER.writeValueAsString(dag);
        } catch (Exception e) {
            throw ApiException.badRequest("dag 不是合法 JSON: " + e.getMessage());
        }
        new DagValidator(ComponentRegistry.getInstance().listMeta())
                .validate(DagValidator.fromJson(json));
        return json;
    }

    private Map<String, Object> toListView(JobEntity j) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("id", j.getId());
        m.put("name", j.getName());
        m.put("description", j.getDescription());
        m.put("version", j.getVersion());
        m.put("parallelism", j.getParallelism());
        m.put("updatedAt", j.getUpdatedAt());
        // runningStatus = 该作业最新实例状态，无则 null
        m.put("runningStatus", instanceRepo.findFirstByJobIdOrderByIdDesc(j.getId())
                .map(JobInstanceEntity::getStatus).orElse(null));
        return m;
    }

    private Map<String, Object> toDetailView(JobEntity j) {
        Map<String, Object> m = toListView(j);
        m.put("ownerId", j.getOwnerId());
        m.put("createdAt", j.getCreatedAt());
        try {
            m.put("dag", MAPPER.readValue(j.getDagJson(), Object.class));
        } catch (Exception e) {
            m.put("dag", j.getDagJson());
        }
        return m;
    }

    static Map<String, Object> instanceView(JobInstanceEntity i) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("id", i.getId());
        m.put("jobId", i.getJobId());
        m.put("jobVersion", i.getJobVersion());
        m.put("status", i.getStatus());
        m.put("totalRows", i.getTotalRows());
        m.put("errorMsg", i.getErrorMsg());
        m.put("startedAt", i.getStartedAt());
        m.put("stoppedAt", i.getStoppedAt());
        m.put("createdAt", i.getCreatedAt());
        return m;
    }

    /** GET /api/jobs → 作业列表（普通用户只能看自己的，ADMIN 看全部）。 */
    @GetMapping
    public List<Map<String, Object>> list(HttpServletRequest req) {
        List<JobEntity> jobs = isAdmin(req)
                ? jobRepo.findAll()
                : jobRepo.findByOwnerIdOrderByIdDesc(uid(req));
        return jobs.stream().map(this::toListView).toList();
    }

    /** POST /api/jobs {name,description,parallelism,dag} */
    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        JobEntity j = new JobEntity();
        j.setName(required(body, "name"));
        j.setDescription(body.get("description") == null ? null : String.valueOf(body.get("description")));
        j.setParallelism(intOr(body.get("parallelism"), 1));
        // 创建作业允许空 DAG（先建作业再进画布编排）；上线时才强制校验 DAG 完整有效
        Object dag = body.get("dag");
        j.setDagJson(dag == null ? "{\"nodes\":[],\"edges\":[]}" : validateAndSerializeDag(dag));
        j.setOwnerId(uid(req));
        return toDetailView(jobRepo.save(j));
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable Long id) {
        return toDetailView(findJob(id));
    }

    /** PUT /api/jobs/{id}：每次保存版本号 +1。 */
    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        JobEntity j = findJob(id);
        if (!instanceRepo.findByJobIdAndStatusIn(id, ACTIVE).isEmpty()) {
            throw ApiException.conflict("作业存在运行中的实例，请先下线再修改");
        }
        if (body.get("name") != null) {
            j.setName(String.valueOf(body.get("name")));
        }
        if (body.get("description") != null) {
            j.setDescription(String.valueOf(body.get("description")));
        }
        if (body.get("parallelism") != null) {
            j.setParallelism(intOr(body.get("parallelism"), 1));
        }
        if (body.get("dag") != null) {
            j.setDagJson(validateAndSerializeDag(body.get("dag")));
        }
        j.setVersion(j.getVersion() + 1);
        return toDetailView(jobRepo.save(j));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public Map<String, Object> delete(@PathVariable Long id) {
        JobEntity j = findJob(id);
        if (!instanceRepo.findByJobIdAndStatusIn(id, ACTIVE).isEmpty()) {
            throw ApiException.conflict("作业存在运行中的实例，请先下线再删除");
        }
        List<Long> instanceIds = instanceRepo.findByJobIdOrderByIdDesc(id).stream()
                .map(JobInstanceEntity::getId).toList();
        if (!instanceIds.isEmpty()) {
            metricRepo.deleteByInstanceIdIn(instanceIds);
            for (Long instanceId : instanceIds) {
                shardRepo.deleteAll(shardRepo.findByInstanceId(instanceId));
            }
            instanceRepo.deleteAllById(instanceIds);
        }
        jobRepo.delete(j);
        return Map.of("ok", true);
    }

    /**
     * POST /api/jobs/{id}/online：创建实例（DAG 快照 + 按并行度生成 PENDING 分片）。
     * 已有 RUNNING/PENDING 实例则报错。
     */
    @PostMapping("/{id}/online")
    @Transactional
    public Map<String, Object> online(@PathVariable Long id) {
        JobEntity j = findJob(id);
        if (!instanceRepo.findByJobIdAndStatusIn(id, ACTIVE).isEmpty()) {
            throw ApiException.conflict("作业已有运行中/待运行的实例，不能重复上线");
        }
        // 上线前强制校验 DAG：空 DAG 或编排不合法时不允许上线
        new DagValidator(ComponentRegistry.getInstance().listMeta())
                .validate(DagValidator.fromJson(j.getDagJson()));
        JobInstanceEntity inst = new JobInstanceEntity();
        inst.setJobId(j.getId());
        inst.setJobVersion(j.getVersion());
        inst.setDagSnapshot(j.getDagJson());
        inst.setStatus(JobInstanceEntity.PENDING);
        inst = instanceRepo.save(inst);
        for (int i = 0; i < j.getParallelism(); i++) {
            JobShardEntity shard = new JobShardEntity();
            shard.setInstanceId(inst.getId());
            shard.setShardIndex(i);
            shardRepo.save(shard);
        }
        return instanceView(inst);
    }

    /** POST /api/jobs/{id}/offline：最新运行中实例置 STOPPING（分片同步置 STOPPING）。 */
    @PostMapping("/{id}/offline")
    @Transactional
    public Map<String, Object> offline(@PathVariable Long id) {
        findJob(id);
        List<JobInstanceEntity> active = instanceRepo.findByJobIdAndStatusIn(id,
                List.of(JobInstanceEntity.PENDING, JobInstanceEntity.RUNNING));
        if (active.isEmpty()) {
            throw ApiException.badRequest("作业没有运行中的实例");
        }
        JobInstanceEntity inst = active.get(0);
        inst.setStatus(JobInstanceEntity.STOPPING);
        instanceRepo.save(inst);
        for (JobShardEntity shard : shardRepo.findByInstanceId(inst.getId())) {
            if (JobInstanceEntity.PENDING.equals(shard.getStatus())
                    || JobInstanceEntity.RUNNING.equals(shard.getStatus())) {
                shard.setStatus(JobInstanceEntity.STOPPING);
                shardRepo.save(shard);
            }
        }
        return instanceView(inst);
    }

    /** GET /api/jobs/{id}/instances → 实例列表（新的在前）。 */
    @GetMapping("/{id}/instances")
    public List<Map<String, Object>> instances(@PathVariable Long id) {
        findJob(id);
        return instanceRepo.findByJobIdOrderByIdDesc(id).stream()
                .map(JobController::instanceView).toList();
    }

    private JobEntity findJob(Long id) {
        return jobRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("作业不存在: " + id));
    }

    private static String required(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null || String.valueOf(v).isBlank()) {
            throw ApiException.badRequest("缺少参数: " + key);
        }
        return String.valueOf(v);
    }

    private static int intOr(Object v, int def) {
        if (v == null) {
            return def;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        return Integer.parseInt(String.valueOf(v));
    }
}
