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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * DAG 校验器。对应设计文档 §4.3。
 *
 * <p>v2 执行引擎支持「扇出广播」：1 个 SOURCE → 0..N 个串行 PROCESS → M 个 SINK。
 * 规则：恰好 1 个 SOURCE（入度 0）；PROCESS 入度 1、出度 ≥1 且构成一条串行链；
 * SINK 入度 1、出度 0，且所有 SINK 的前驱必须是同一个链尾节点（链尾=最后一个
 * PROCESS，无 PROCESS 时为 SOURCE）。不支持扇入/多源合并。
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
            int out = outgoing.get(n.id()).size();
            int in = inDegree.get(n.id());
            switch (category) {
                case "SOURCE" -> {
                    sources++;
                    if (in > 0) {
                        throw new IllegalArgumentException("SOURCE 节点不能有前驱: " + n.id());
                    }
                    if (out < 1) {
                        throw new IllegalArgumentException("SOURCE 节点缺少出边: " + n.id());
                    }
                }
                case "SINK" -> {
                    sinks++;
                    if (out > 0) {
                        throw new IllegalArgumentException("SINK 节点不能有后继: " + n.id());
                    }
                    if (in != 1) {
                        throw new IllegalArgumentException(
                                "SINK 节点必须恰好 1 条入边: " + n.id() + "，当前 " + in + " 条");
                    }
                }
                case "PROCESS" -> {
                    if (in != 1) {
                        throw new IllegalArgumentException(
                                "PROCESS 节点必须恰好 1 条入边: " + n.id() + "，当前 " + in + " 条");
                    }
                    if (out < 1) {
                        throw new IllegalArgumentException(
                                "PROCESS 节点缺少出边（链路必须到达 SINK）: " + n.id());
                    }
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
        assertChainWithFanout(dag.nodes(), outgoing, nodeById);
    }

    /**
     * 链式结构 + 扇出校验：从 SOURCE 沿唯一出边走过 PROCESS 链，链尾节点的所有出边
     * 必须全部指向 SINK，且每个 SINK 的前驱都是该链尾；最终覆盖全部节点。
     */
    private void assertChainWithFanout(List<Node> nodes, Map<String, List<String>> outgoing,
                                       Map<String, Node> nodeById) {
        String cur = nodes.stream()
                .filter(n -> "SOURCE".equals(metaByCode.get(n.componentCode()).category()))
                .map(Node::id).findFirst().orElseThrow();
        Set<String> visited = new HashSet<>();
        visited.add(cur);
        // 沿串行 PROCESS 链前进
        while (true) {
            List<String> outs = outgoing.get(cur);
            long procTargets = outs.stream()
                    .filter(t -> "PROCESS".equals(metaByCode.get(nodeById.get(t).componentCode()).category()))
                    .count();
            if (outs.size() > 1 && procTargets > 0) {
                throw new IllegalArgumentException(
                        "暂不支持分支：节点 " + cur + " 存在 " + outs.size()
                                + " 条出边（仅链尾节点可扇出到多个 SINK）");
            }
            if (outs.size() == 1 && procTargets == 1) {
                cur = outs.get(0);
                if (!visited.add(cur)) {
                    throw new IllegalArgumentException("DAG 存在环（经过节点 " + cur + "）");
                }
                continue;
            }
            break; // cur 为链尾（或所有出边都指向 SINK 的节点）
        }
        // 链尾的所有出边必须全部指向 SINK
        String chainEnd = cur;
        for (String t : outgoing.get(chainEnd)) {
            if (!"SINK".equals(metaByCode.get(nodeById.get(t).componentCode()).category())) {
                throw new IllegalArgumentException(
                        "暂不支持分支：节点 " + chainEnd + " 的出边只能指向 SINK");
            }
        }
        // 每个 SINK 的前驱必须是链尾节点
        int sinkCount = 0;
        for (Node n : nodes) {
            if ("SINK".equals(metaByCode.get(n.componentCode()).category())) {
                sinkCount++;
                // SINK 入度已校验为 1，其唯一前驱 = 链尾
                boolean fromChainEnd = outgoing.get(chainEnd).contains(n.id());
                if (!fromChainEnd) {
                    throw new IllegalArgumentException(
                            "SINK 节点 " + n.id() + " 的前驱必须是链尾节点 " + chainEnd
                                    + "（不支持扇入/多来源）");
                }
            }
        }
        if (visited.size() + sinkCount != nodes.size()) {
            throw new IllegalArgumentException(
                    "DAG 存在游离节点：链覆盖 " + visited.size() + " 个 + SINK " + sinkCount
                            + " 个，总计 " + nodes.size() + " 个节点");
        }
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

    /** 流水线结构：串行链（SOURCE + PROCESS...）+ 扇出 SINK 列表。 */
    public record Pipeline(List<Node> chain, List<Node> sinks) {
    }

    /**
     * 供 Worker 使用：把 DAG 拆成「串行链 + 扇出 SINK」。
     * 调用前应先通过 validate()；本方法对非法结构直接抛 IllegalArgumentException。
     */
    public static Pipeline toPipeline(Dag dag) {
        Map<String, Node> nodeById = new HashMap<>();
        Map<String, List<String>> outgoing = new HashMap<>();
        Map<String, Integer> inDegree = new HashMap<>();
        for (Node n : dag.nodes()) {
            nodeById.put(n.id(), n);
            outgoing.put(n.id(), new ArrayList<>());
            inDegree.put(n.id(), 0);
        }
        for (Dag.Edge e : dag.edges() == null ? List.<Dag.Edge>of() : dag.edges()) {
            outgoing.get(e.from()).add(e.to());
            inDegree.merge(e.to(), 1, Integer::sum);
        }
        String cur = inDegree.entrySet().stream().filter(en -> en.getValue() == 0)
                .map(Map.Entry::getKey).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("DAG 存在环或无起始节点"));
        List<Node> chain = new ArrayList<>();
        List<Node> sinks = new ArrayList<>();
        while (cur != null) {
            List<String> outs = outgoing.get(cur);
            if (outs.size() == 1 && inDegree.get(outs.get(0)) == 1
                    && !outgoing.get(outs.get(0)).isEmpty()) {
                // 唯一后继且仍有出边 → 链上节点
                chain.add(nodeById.get(cur));
                cur = outs.get(0);
            } else {
                // 链尾：其余出边指向的都是 SINK
                chain.add(nodeById.get(cur));
                for (String t : outs) {
                    sinks.add(nodeById.get(t));
                }
                cur = null;
            }
        }
        return new Pipeline(chain, sinks);
    }
}
