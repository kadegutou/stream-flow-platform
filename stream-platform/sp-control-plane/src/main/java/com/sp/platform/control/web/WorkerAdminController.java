package com.sp.platform.control.web;

import com.sp.platform.control.entity.WorkerNodeEntity;
import com.sp.platform.control.repo.WorkerNodeRepo;
import com.sp.platform.control.security.AuthFilters.JwtAuthFilter;
import com.sp.platform.control.web.ApiExceptionHandler.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Worker 节点管理：列表 + 在线日志查看（代理转发到 Worker 的 /logs/tail）。 */
@RestController
@RequestMapping("/api/workers")
public class WorkerAdminController {

    private final WorkerNodeRepo workerRepo;
    private final RestTemplate http = buildRestTemplate();
    private final String workerToken;

    public WorkerAdminController(WorkerNodeRepo workerRepo,
                                 @Value("${sp.worker-token:dev-token}") String workerToken) {
        this.workerRepo = workerRepo;
        this.workerToken = workerToken;
    }

    /** 设置 connect/read 超时，避免 Worker 挂死时日志代理永久占用线程。 */
    private static RestTemplate buildRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        return new RestTemplate(factory);
    }

    /** GET /api/workers → [{id,nodeCode,address,status,lastHeartbeat}]（登录即可） */
    @GetMapping
    public List<Map<String, Object>> list() {
        return workerRepo.findAll().stream().map(w -> {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("id", w.getId());
            m.put("nodeCode", w.getNodeCode());
            m.put("address", w.getAddress());
            m.put("status", w.getStatus());
            m.put("lastHeartbeat", w.getLastHeartbeat());
            return m;
        }).toList();
    }

    /** GET /api/workers/{id}/logs?lines=200 → 代理到 Worker /logs/tail（仅 ADMIN）。 */
    @GetMapping("/{id}/logs")
    public Map<String, Object> logs(@PathVariable Long id,
                                    @RequestParam(defaultValue = "200") int lines,
                                    HttpServletRequest req) {
        if (!"ADMIN".equals(req.getAttribute(JwtAuthFilter.ATTR_ROLE))) {
            throw ApiException.forbidden("仅管理员可查看 Worker 日志");
        }
        WorkerNodeEntity worker = workerRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("Worker 不存在: " + id));
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Worker-Token", workerToken);
        try {
            String body = http.exchange(
                    "http://" + worker.getAddress() + "/logs/tail?lines=" + Math.min(lines, 2000),
                    HttpMethod.GET, new HttpEntity<>(headers), String.class).getBody();
            return Map.of("workerId", id, "nodeCode", worker.getNodeCode(),
                    "logs", body == null ? "" : body);
        } catch (Exception e) {
            throw ApiException.badRequest("拉取 Worker 日志失败: " + e.getMessage());
        }
    }
}
