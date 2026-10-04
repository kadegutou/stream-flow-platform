#!/usr/bin/env python3
"""汇总 T4 的 iostat 采样，回答「磁盘到底饱和没有」。"""
import glob
import os

# iostat -x 的正确列序（0-based，见表头）：
# 0 Device 1 r/s 2 rkB/s 3 rrqm/s 4 %rrqm 5 r_await 6 rareq-sz
# 7 w/s   8 wkB/s 9 wrqm/s 10 %wrqm 11 w_await 12 wareq-sz
# 21 aqu-sz 22 %util
COLS = [("w/s", 7), ("wkB/s", 8), ("w_await", 11), ("aqu-sz", 21), ("%util", 22)]

os.chdir(os.path.expanduser("~/stream-platform/logs"))

for f in sorted(glob.glob("t4-iostat-*.txt")):
    data = {}
    for line in open(f, errors="ignore"):
        p = line.split()
        if len(p) >= 23 and p[0] in ("dm-0", "sda"):
            try:
                [float(x) for x in p[1:]]
            except ValueError:
                continue
            data.setdefault(p[0], []).append(p)

    tag = f.replace("t4-iostat-", "").replace(".txt", "")
    print(f"=== {tag} ===")
    for dev, rows in data.items():
        rows = rows[1:]  # 第 1 条是"开机至今"的均值，不是本次运行的
        if not rows:
            continue
        n = len(rows)
        parts = []
        for name, i in COLS:
            col = [float(r[i]) for r in rows]
            parts.append(f"{name} 均{sum(col)/n:8.1f} 峰{max(col):8.1f}")
        print(f"  {dev:<5} n={n:<4} " + " | ".join(parts))
