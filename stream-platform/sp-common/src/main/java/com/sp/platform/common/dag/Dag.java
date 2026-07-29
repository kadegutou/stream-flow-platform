package com.sp.platform.common.dag;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

/**
 * 作业 DAG 模型。对应设计文档 §6.1：
 * { "nodes": [{id, componentCode, params}], "edges": [{from, to}] }
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Dag(List<Node> nodes, List<Edge> edges) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Node(String id, String componentCode, Map<String, Object> params) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Edge(String from, String to) {
    }

    public Node node(String id) {
        return nodes.stream().filter(n -> n.id().equals(id)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("DAG 中不存在节点: " + id));
    }
}
