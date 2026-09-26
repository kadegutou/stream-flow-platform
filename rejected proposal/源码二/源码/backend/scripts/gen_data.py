"""
性能测试数据生成脚本

生成 CSV → 字段拼接 → CSV 管线所需的测试数据，三档规模:
  small.csv   10 万行    (~4 MB)
  medium.csv  100 万行   (~40 MB)
  large.csv   1000 万行  (~400 MB)

用法:
  python scripts/gen_data.py            # 生成全部三档
  python scripts/gen_data.py small      # 只生成指定档位
"""

import sys
import time
from pathlib import Path

import polars as pl

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

SIZES = {
    "small": 100_000,
    "medium": 1_000_000,
    "large": 10_000_000,
}

# 模拟真实业务字段：姓 + 名 + 城市（拼接后得到 "姓名" 这类新字段）
FIRST_NAMES = ["伟", "芳", "娜", "敏", "静", "磊", "军", "洋", "勇", "艳"]
LAST_NAMES = ["王", "李", "张", "刘", "陈", "杨", "赵", "黄", "周", "吴"]
CITIES = ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "西安", "南京", "重庆"]


def generate(name: str, rows: int) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    path = DATA_DIR / f"{name}.csv"

    print(f"生成 {path.name}: {rows:,} 行 ...")
    start = time.time()

    df = (
        pl.DataFrame({"id": pl.int_range(1, rows + 1, eager=True)})
        .with_columns([
            ((pl.col("id") // 10) % 10).alias("lk"),
            (pl.col("id") % 10).alias("fk"),
            ((pl.col("id") // 100) % 10).alias("ck"),
        ])
        .join(pl.DataFrame({"k": range(10), "last_name": LAST_NAMES}), left_on="lk", right_on="k")
        .join(pl.DataFrame({"k": range(10), "first_name": FIRST_NAMES}), left_on="fk", right_on="k")
        .join(pl.DataFrame({"k": range(10), "city": CITIES}), left_on="ck", right_on="k")
        .select(["id", "last_name", "first_name", "city"])
    )
    df.write_csv(path)

    elapsed = time.time() - start
    size_mb = path.stat().st_size / 1024 / 1024
    print(f"  完成: {size_mb:.1f} MB, 耗时 {elapsed:.1f}s")


if __name__ == "__main__":
    targets = sys.argv[1:] or list(SIZES)
    for name in targets:
        if name not in SIZES:
            print(f"未知档位: {name}，可选: {list(SIZES)}")
            sys.exit(1)
        generate(name, SIZES[name])
    print("全部完成")
