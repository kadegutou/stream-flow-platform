#!/usr/bin/env python3
"""汇总 T4 的 vmstat 采样，判断「并发收益为何反转」。

判据：
  r  = run-queue 长度。持续超过 vCPU 数（本机 8）即为 CPU 超配 ——
       这是解释「并行度超过某点后聚合吞吐反而下降」的关键证据。
  cs = 上下文切换次数/s，超配时飙升。
  us/sy = 用户态/内核态 CPU 占比；sy 高说明大量时间花在调度与系统调用上。

只看「忙时的样本」（us+sy ≥ BUSY_PCT），否则任务之间的空转样本会把均值稀释掉。
"""
import glob
import os
import sys

NCPU = 8
BUSY_PCT = 20  # 低于此值视为任务间隙，不计入统计

# vmstat 列（0-based）：0 r 1 b 2 swpd 3 free 4 buff 5 cache 6 si 7 so
#                     8 bi 9 bo 10 in 11 cs 12 us 13 sy 14 id 15 wa 16 st
COLS = [("r", 0), ("cs", 11), ("us", 12), ("sy", 13), ("id", 14), ("wa", 15)]

logdir = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/stream-platform/logs")
os.chdir(logdir)

for f in sorted(glob.glob("t4-vmstat-*.txt")):
    rows = []
    for line in open(f, errors="ignore"):
        p = line.split()
        if len(p) < 17:
            continue
        try:
            rows.append([float(x) for x in p])
        except ValueError:
            continue
    if not rows:
        print(f"=== {f} === (无数据)")
        continue

    busy = [r for r in rows if r[12] + r[13] >= BUSY_PCT]
    tag = f.replace("t4-vmstat-", "").replace(".txt", "")
    print(f"=== {tag} ===")
    print(f"  样本 {len(rows)}（其中忙时 {len(busy)}）")
    if not busy:
        print("  !! 没有忙时样本，任务可能没跑起来")
        continue

    n = len(busy)
    for name, i in COLS:
        col = [r[i] for r in busy]
        print(f"  {name:<3} 均{sum(col)/n:8.1f} 峰{max(col):8.1f}", end="")
        if name == "r":
            over = sum(1 for v in col if v > NCPU)
            print(f"   超过 {NCPU} 核的样本占比 {over/n*100:.0f}%", end="")
        print()
