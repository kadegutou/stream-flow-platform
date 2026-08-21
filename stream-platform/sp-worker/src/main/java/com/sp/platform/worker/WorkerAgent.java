package com.sp.platform.worker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.net.InetAddress;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Worker Agent：启动注册、每 5s 心跳拉任务、每 5s 上报指标。对应设计文档 §2 数据面。
 */
@Component
public class WorkerAgent implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(WorkerAgent.class);

    private final RestTemplate http = buildRestTemplate();
    private final ExecutionEngine engine;

    private final String baseUrl;
    private final String token;
    private final String nodeCode;
    private final int serverPort;

    private volatile Long workerId;
    private String regCode;
    private String regAddress;

    public WorkerAgent(ExecutionEngine engine,
                       @Value("${sp.control-plane-url:http://localhost:8080}") String baseUrl,
                       @Value("${sp.worker-token:dev-token}") String token,
                       @Value("${WORKER_NODE_CODE:${sp.worker.node-code:}}") String nodeCode,
                       @Value("${server.port:8081}") int serverPort) {
        this.engine = engine;
        this.baseUrl = baseUrl;
        this.token = token;
        this.nodeCode = nodeCode;
        this.serverPort = serverPort;
    }

    /** 设置 connect/read 超时，避免控制面异常时心跳/上报线程被永久挂住。 */
    private static RestTemplate buildRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        return new RestTemplate(factory);
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        regCode = nodeCode == null || nodeCode.isBlank()
                ? InetAddress.getLocalHost().getHostName() + "-" + ProcessHandle.current().pid()
                : nodeCode;
        regAddress = InetAddress.getLocalHost().getHostAddress() + ":" + serverPort;
        registerLoop();
    }

    /** 控制面可能尚未就绪（或已重启丢数据），重试直到注册成功。 */
    private void registerLoop() {
        while (workerId == null) {
            try {
                Map<?, ?> resp = post("/api/worker/register",
                        Map.of("nodeCode", regCode, "address", regAddress));
                workerId = ((Number) resp.get("workerId")).longValue();
                log.info("Worker 注册成功: nodeCode={}, workerId={}", regCode, workerId);
            } catch (Exception e) {
                log.warn("注册控制面失败（{}），3s 后重试", e.getMessage());
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    /** 每 5s 心跳：更新存活，拉取新分片任务与停止指令。 */
    @Scheduled(fixedDelay = 5000, initialDelay = 5000)
    public void heartbeat() {
        if (workerId == null) {
            return;
        }
        try {
            Map<?, ?> resp = post("/api/worker/heartbeat", Map.of("workerId", workerId));
            Object assignments = resp.get("assignments");
            if (assignments instanceof List<?> list) {
                for (Object o : list) {
                    if (o instanceof Map<?, ?> a) {
                        engine.start(new ExecutionEngine.ShardAssignment(
                                ((Number) a.get("shardId")).longValue(),
                                ((Number) a.get("instanceId")).longValue(),
                                String.valueOf(a.get("dagSnapshot")),
                                ((Number) a.get("shardIndex")).intValue(),
                                ((Number) a.get("totalShards")).intValue(),
                                a.get("shardKey") == null ? null : String.valueOf(a.get("shardKey")),
                                a.get("fenceToken") == null ? 0L : ((Number) a.get("fenceToken")).longValue(),
                                a.get("resumeOffset") == null ? 0L : ((Number) a.get("resumeOffset")).longValue()));
                    }
                }
            }
            handleStopIds(resp.get("stopShardIds"));
        } catch (Exception e) {
            // 控制面重启/换库后 workerId 失效：置空并重新注册，实现自动恢复
            if (e.getMessage() != null && e.getMessage().contains("Worker 不存在")) {
                log.warn("控制面不认识本节点（可能已重启），重新注册...");
                workerId = null;
                registerLoop();
                return;
            }
            log.warn("心跳失败: {}", e.getMessage());
        }
    }

    /** 每 5s 上报分片状态与指标。 */
    @Scheduled(fixedDelay = 5000, initialDelay = 8000)
    public void report() {
        if (workerId == null) {
            return;
        }
        List<ExecutionEngine.ShardReport> reports = engine.collectReports();
        if (reports.isEmpty()) {
            return;
        }
        try {
            List<Map<String, Object>> shards = reports.stream().map(r -> {
                Map<String, Object> m = new HashMap<String, Object>();
                m.put("shardId", r.shardId());
                m.put("status", r.status());
                m.put("totalRows", r.totalRows());
                m.put("rowsPerSec", r.rowsPerSec());
                m.put("errorMsg", r.errorMsg());
                m.put("fenceToken", r.fenceToken());
                m.put("progress", r.progress());
                return m;
            }).toList();
            Map<?, ?> resp = post("/api/worker/report", Map.of("workerId", workerId, "shards", shards));
            // 上报被控制面拒绝的分片（fenceToken 过期，已被重派）→ 本地立即停止
            handleStopIds(resp.get("stopShardIds"));
        } catch (Exception e) {
            log.warn("上报失败: {}", e.getMessage());
        }
    }

    private void handleStopIds(Object stopIds) {
        if (stopIds instanceof List<?> list) {
            for (Object o : list) {
                engine.stop(((Number) o).longValue());
            }
        }
    }

    @SuppressWarnings("unchecked")
    private Map<?, ?> post(String path, Map<String, Object> body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        // 必须限定 Accept=JSON：sp-components 引入了 jackson-dataformat-xml，
        // 否则两端内容协商可能走 XML，导致数字被反序列化为字符串
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        headers.set("X-Worker-Token", token);
        Map<?, ?> resp = http.postForObject(baseUrl + path, new HttpEntity<>(body, headers), Map.class);
        if (resp == null) {
            throw new IllegalStateException("控制面返回空: " + path);
        }
        return resp;
    }
}
