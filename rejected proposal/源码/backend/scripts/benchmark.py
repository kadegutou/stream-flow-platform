"""
性能基准测试 — CSV 输入 → 字段拼接 → CSV 输出 完整管线

用法:
  python scripts/benchmark.py              # 默认 small + medium，各跑 3 轮
  python scripts/benchmark.py large 1      # 指定档位和轮数

输出: 每轮总耗时、吞吐量(行/秒)、分节点耗时，最后给出平均值
（性能测试报告可直接引用）
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: F401  触发控件注册
from app.engine.dag_executor import executor

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

SIZES = {"small": 100_000, "medium": 1_000_000, "large": 10_000_000}


def build_dag(name: str) -> dict:
    return {
        "nodes": [
            {
                "id": "n1",
                "component_name": "csv-input",
                "config": {"path": str(DATA_DIR / f"{name}.csv")},
                "data": {"label": "CSV 输入"},
            },
            {
                "id": "n2",
                "component_name": "concat",
                "config": {"field_a": "last_name", "field_b": "first_name", "field_c": "full_name"},
                "data": {"label": "字段拼接"},
            },
            {
                "id": "n3",
                "component_name": "csv-output",
                "config": {"path": str(DATA_DIR / f"{name}_out.csv")},
                "data": {"label": "CSV 输出"},
            },
        ],
        "edges": [
            {"id": "e1", "source": "n1", "target": "n2"},
            {"id": "e2", "source": "n2", "target": "n3"},
        ],
    }


async def bench(name: str, rounds: int) -> None:
    rows = SIZES[name]
    dag = build_dag(name)
    print(f"\n=== {name}.csv ({rows:,} 行, {(DATA_DIR / f'{name}.csv').stat().st_size / 1024 / 1024:.0f} MB) ===")

    elapseds = []
    for i in range(1, rounds + 1):
        result = await executor.execute(0, dag)
        if result["status"] != "success":
            print(f"  第 {i} 轮失败: {result.get('error')}")
            for log in result.get("logs", [])[-3:]:
                print(f"    {log}")
            return

        elapsed = result["elapsed_ms"] / 1000
        elapseds.append(elapsed)
        node_ms = {
            nid: f"{r.get('elapsed_ms', 0):.0f}ms"
            for nid, r in result["node_results"].items()
        }
        print(
            f"  第 {i} 轮: {elapsed:.2f}s | 吞吐 {rows / elapsed:,.0f} 行/s "
            f"| 输入 {node_ms.get('n1')} 拼接 {node_ms.get('n2')} 输出 {node_ms.get('n3')}"
        )

    avg = sum(elapseds) / len(elapseds)
    print(f"  ── 平均: {avg:.2f}s | 平均吞吐 {rows / avg:,.0f} 行/s ──")


async def main(targets: list[str], rounds: int) -> None:
    for t in targets:
        await bench(t, rounds)


if __name__ == "__main__":
    targets = [a for a in sys.argv[1:] if a in SIZES] or ["small", "medium"]
    rounds = next((int(a) for a in sys.argv[1:] if a.isdigit()), 3)
    asyncio.run(main(targets, rounds))
