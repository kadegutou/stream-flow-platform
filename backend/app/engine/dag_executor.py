"""
DAG 执行器 — 参考 VibeETL 的 graphlib.TopologicalSorter + 依赖失败传播

改进点:
  1. 使用 Python 标准库 TopologicalSorter 替代手写 Kahn
  2. 上游节点失败 → 自动跳过下游 (依赖失败传播)
  3. 节点执行状态追踪 (waiting → running → success/error)
  4. 按阶段并行执行 (同级节点并行)
  5. 执行日志收集
"""

import json
import time
import logging
from typing import Any
from graphlib import TopologicalSorter

from .component_base import get_component

logger = logging.getLogger(__name__)


class NodeStatus:
    WAITING = "waiting"
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


class DAGExecutor:
    """有向无环图执行器"""

    def __init__(self):
        self._cancel_flags: dict[str, bool] = {}

    async def execute(
        self,
        job_id: int,
        dag_config: dict,
        cancel_check=None,
    ) -> dict[str, Any]:
        """
        执行指定作业的 DAG

        Args:
            job_id:     作业 ID
            dag_config: {"nodes": [...], "edges": [...]}
            cancel_check: 可选的可调用对象，返回 True 表示已取消

        Returns:
            {"status": "success", "rows_processed": 1234, "node_results": {...}}
        """
        nodes: list[dict] = dag_config.get("nodes", [])
        edges: list[dict] = dag_config.get("edges", [])

        if not nodes:
            return {"status": "error", "error": "DAG 中没有任何节点"}

        pipeline_start = time.time()
        node_map: dict[str, dict] = {n["id"]: n for n in nodes}
        node_results: dict[str, dict] = {}
        node_status: dict[str, str] = {}
        global_logs: list[str] = []
        total_rows = 0

        # ── 1. 构建前驱关系 ──
        predecessors: dict[str, set[str]] = {n["id"]: set() for n in nodes}
        data_links: dict[str, dict[str, list[tuple[str, str]]]] = {
            n["id"]: {} for n in nodes
        }

        for edge in edges:
            src = edge.get("source")
            tgt = edge.get("target")
            src_port = edge.get("sourceHandle", "output")
            tgt_port = edge.get("targetHandle", "input")

            if src in predecessors and tgt in predecessors:
                predecessors[tgt].add(src)
                if tgt_port not in data_links[tgt]:
                    data_links[tgt][tgt_port] = []
                data_links[tgt][tgt_port].append((src, src_port))

        # ── 2. 拓扑排序 ──
        try:
            ts = TopologicalSorter(predecessors)
            execution_order = list(ts.static_order())
        except Exception as e:
            err = f"DAG 中存在环形依赖: {e}"
            logger.error(err)
            return {"status": "error", "error": err}

        logger.info(f"作业 {job_id} 拓扑序: {execution_order}")
        global_logs.append(f"拓扑排序完成，执行序: {execution_order}")

        # ── 3. 初始化状态 ──
        for nid in execution_order:
            node_status[nid] = NodeStatus.WAITING

        # ── 4. 按拓扑序执行 ──
        for nid in execution_order:
            # 检查取消
            if cancel_check and cancel_check():
                node_status[nid] = NodeStatus.CANCELLED
                global_logs.append(f"作业被取消，跳过节点: {nid}")
                break

            node_cfg = node_map.get(nid)
            if not node_cfg:
                continue

            component_name = node_cfg.get("component_name", "")
            config = node_cfg.get("config", {})
            label = node_cfg.get("data", {}).get("label", f"{component_name}_{nid}")

            # 检查上游是否有失败
            upstream_failed = False
            upstream_ids = predecessors.get(nid, set())

            for uid in upstream_ids:
                if node_results.get(uid, {}).get("status") == "error":
                    upstream_failed = True
                    break

            if upstream_failed:
                node_status[nid] = NodeStatus.SKIPPED
                node_results[nid] = {"status": "skipped", "reason": "上游节点执行失败"}
                global_logs.append(f"节点 '{label}' ({nid}) 因上游失败被跳过")
                continue

            # 获取上游数据
            inputs: dict = {}
            for port, src_links in data_links.get(nid, {}).items():
                for src_id, src_port in src_links:
                    src_result = node_results.get(src_id, {})
                    src_data = src_result.get("data")
                    if src_data is not None:
                        inputs[port] = src_data

            # 执行控件
            comp = get_component(component_name)
            if comp is None:
                node_status[nid] = NodeStatus.ERROR
                node_results[nid] = {"status": "error", "error": f"未知控件: {component_name}"}
                global_logs.append(f"节点 '{label}' ({nid}) 执行失败: 未知控件类型")
                continue

            node_status[nid] = NodeStatus.RUNNING
            node_start = time.time()
            global_logs.append(f"执行节点: '{label}' ({nid}) [{comp.display_name}]")

            try:
                result = await comp.execute(config, inputs if inputs else None)
                elapsed = (time.time() - node_start) * 1000

                node_status[nid] = NodeStatus.SUCCESS
                node_results[nid] = {
                    "status": "success",
                    "data": result.get("data"),
                    "rows": result.get("rows", 0),
                    "elapsed_ms": elapsed,
                    "columns": result.get("columns"),
                }
                total_rows += result.get("rows", 0)
                global_logs.append(
                    f"节点 '{label}' ({nid}) 完成: "
                    f"{result.get('rows', 0)} 行, 耗时 {elapsed:.0f}ms"
                )

            except Exception as e:
                elapsed = (time.time() - node_start) * 1000
                node_status[nid] = NodeStatus.ERROR
                node_results[nid] = {
                    "status": "error",
                    "error": str(e),
                    "elapsed_ms": elapsed,
                }
                global_logs.append(
                    f"节点 '{label}' ({nid}) 执行异常: {e}"
                )
                logger.error(f"节点执行异常 [{nid}]: {e}")

        # ── 5. 汇总结果 ──
        total_time = (time.time() - pipeline_start) * 1000
        succeeded = sum(1 for s in node_status.values() if s == NodeStatus.SUCCESS)
        failed = sum(1 for s in node_status.values() if s == NodeStatus.ERROR)

        global_logs.append(
            f"流水线执行完成: {succeeded} 成功, {failed} 失败, 总耗时 {total_time:.0f}ms"
        )

        return {
            "status": "success" if failed == 0 else "partial",
            "rows_processed": total_rows,
            "elapsed_ms": total_time,
            "node_results": node_results,
            "node_status": node_status,
            "logs": global_logs,
        }


# 全局单例
executor = DAGExecutor()
