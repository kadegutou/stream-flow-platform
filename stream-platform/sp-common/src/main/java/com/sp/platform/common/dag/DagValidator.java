package com.sp.platform.common.dag;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sp.platform.common.dag.Dag.Edge;
import com.sp.platform.common.dag.Dag.Node;
import com.sp.platform.common.spi.ComponentMeta;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * DAG 校验器。对应设计文档 §4.3：
 * 图无环、恰好 1 个 SOURCE、>=1 个 SINK、SOURCE 无前驱、SINK 无后继、
 * 每个节点 params 必填项齐（按 schema required 简单校验）。
 */
public class DagValidator {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** metaByCode: 控件编码 -> 元数据（含类别与参数 Schema） */
    private final Map<String, ComponentMeta> metaByCode;

    public DagValidator(List<ComponentMeta> metas) {
        this.metaByCode = new HashMap<>();
        for (ComponentMeta m : metas) {
            metaByCode.put(m.code(), m);
        }
    }

    /** 校验通过返回 null 以外的什么都不做；失败抛 IllegalArgumentException（信息供前端展示）。 */
    public void validate(Dag dag) {
        if (dag == null || dag.nodes() == null || dag.nodes().isEmpty()) {
            throw new IllegalArgumentException("DAG 不能为空");
        }
        List<Edge> edges = dag.edges() == null ? List.of() : dag.edges();

        Map<String, Node> nodeById = new HashMap<>();
        for (Node n : dag.nodes()) {
            if (n.id() == null || n.id().isBlank()) {
                throw new IllegalArgumentException("存在缺少 id 的节点");
            }
            if (nodeById.put(n.id(), n) != null) {
                throw new IllegalArgumentException("节点 id 重复: " + n.id());
            }
            ComponentMeta meta = metaByCode.get(n.componentCode());
            if (meta == null) {
                throw new IllegalArgumentException("节点 " + n.id() + " 引用了未注册的控件: " + n.componentCode());
            }
            validateParams(n, meta);
        }

        Map<String, List<String>> outgoing = new HashMap<>();
        Map<String, Integer> inDegree = new HashMap<>();
        for (Node n : dag.nodes()) {
            outgoing.put(n.id(), new ArrayList<>());
            inDegree.put(n.id(), 0);
        }
        for (Edge e : edges) {
            if (!nodeById.containsKey(e.from()) || !nodeById.containsKey(e.to())) {
                throw new IllegalArgumentException("边引用了不存在的节点: " + e.from() + " -> " + e.to());
            }
            outgoing.get(e.from()).add(e.to());
            inDegree.merge(e.to(), 1, Integer::sum);
        }

        int sources = 0;
        int sinks = 0;
        for (Node n : dag.nodes()) {
            String category = metaByCode.get(n.componentCode()).category();
            switch (category) {
                case "SOURCE" -> {
                    sources++;
                    if (inDegree.get(n.id()) > 0) {
                        throw new IllegalArgumentException("SOURCE 节点不能有前驱: " + n.id());
                    }
                }
                case "SINK" -> {
                    sinks++;
                    if (!outgoing.get(n.id()).isEmpty()) {
                        throw new IllegalArgumentException("SINK 节点不能有后继: " + n.id());
                    }
                }
                case "PROCESS" -> {
                    // ok
                }
                default -> throw new IllegalArgumentException("未知控件类别: " + category);
            }
        }
        if (sources != 1) {
            throw new IllegalArgumentException("DAG 必须恰好包含 1 个 SOURCE，当前: " + sources);
        }
        if (sinks < 1) {
            throw new IllegalArgumentException("DAG 至少包含 1 个 SINK");
        }

        assertAcyclic(dag.nodes(), outgoing, inDegree);
    }

    /** Kahn 拓扑排序判环。 */
    private void assertAcyclic(List<Node> nodes, Map<String, List<String>> outgoing,
                               Map<String, Integer> inDegree) {
        Map<String, Integer> deg = new HashMap<>(inDegree);
        Deque<String> queue = new ArrayDeque<>();
        for (Node n : nodes) {
            if (deg.get(n.id()) == 0) {
                queue.add(n.id());
            }
        }
        int visited = 0;
        while (!queue.isEmpty()) {
            String id = queue.poll();
            visited++;
            for (String next : outgoing.get(id)) {
                if (deg.merge(next, -1, Integer::sum) == 0) {
                    queue.add(next);
                }
            }
        }
        if (visited != nodes.size()) {
            throw new IllegalArgumentException("DAG 存在环");
        }
    }

    /** 按 paramSchema 的 required 数组做必填项简单校验。 */
    private void validateParams(Node node, ComponentMeta meta) {
        try {
            JsonNode schema = MAPPER.readTree(meta.paramSchema());
            JsonNode required = schema.get("required");
            if (required == null || !required.isArray()) {
                return;
            }
            Map<String, Object> params = node.params() == null ? Map.of() : node.params();
            for (JsonNode r : required) {
                String key = r.asText();
                Object v = params.get(key);
                if (v == null || (v instanceof String s && s.isBlank())) {
                    throw new IllegalArgumentException(
                            "节点 " + node.id() + "(" + meta.code() + ") 缺少必填参数: " + key);
                }
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("控件 " + meta.code() + " 的 paramSchema 不是合法 JSON", e);
        }
    }

    /** 便捷方法：按控件类别查元数据。 */
    public ComponentMeta metaOf(String componentCode) {
        return metaByCode.get(componentCode);
    }

    public static Dag fromJson(String json) {
        try {
            return MAPPER.readValue(json, Dag.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("DAG JSON 解析失败: " + e.getMessage(), e);
        }
    }

    public static String toJson(Dag dag) {
        try {
            return MAPPER.writeValueAsString(dag);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** 供 Worker 使用：把链式 DAG 拓扑排序为节点序列（v1 仅支持线性链）。 */
    public static List<Node> toLinearChain(Dag dag) {
        Map<String, Node> nodeById = new HashMap<>();
        Map<String, String> next = new HashMap<>();
        Map<String, Integer> inDegree = new HashMap<>();
        for (Node n : dag.nodes()) {
            nodeById.put(n.id(), n);
            inDegree.put(n.id(), 0);
        }
        for (Dag.Edge e : dag.edges() == null ? List.<Dag.Edge>of() : dag.edges()) {
            if (next.put(e.from(), e.to()) != null) {
                throw new IllegalArgumentException("v1 执行引擎仅支持线性链：节点 " + e.from() + " 存在多个出边");
            }
            inDegree.merge(e.to(), 1, Integer::sum);
        }
        List<Node> chain = new ArrayList<>();
        String cur = inDegree.entrySet().stream().filter(en -> en.getValue() == 0)
                .map(Map.Entry::getKey).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("DAG 存在环或无起始节点"));
        while (cur != null) {
            chain.add(nodeById.get(cur));
            cur = next.get(cur);
        }
        if (chain.size() != dag.nodes().size()) {
            throw new IllegalArgumentException("v1 执行引擎仅支持线性链：DAG 存在分支或环");
        }
        return chain;
    }
}
