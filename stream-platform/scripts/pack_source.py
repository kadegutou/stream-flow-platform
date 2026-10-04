# -*- coding: utf-8 -*-
"""打包交付用源码包：把 stream-platform/ 打成 deliverables/项目源码包.zip。

- 只收源码与配置，剔除构建产物（target / node_modules / dist）、日志、测试数据、缓存；
- 包内顶层目录为 stream-platform/，解压即可用；
- 默认输出 deliverables/项目源码包.zip（题目要求 .zip 格式）。

用法:
    python pack_source.py            # 打包
    python pack_source.py --check    # 只体检：包是否已落后于磁盘源码（不写文件）

`--check` 是为防止本项目反复出现的「产物与源码脱节」而加的：
源码改了但忘记重打 zip，评委拿到的包就是旧版，且现场很难发现。
"""
import os
import sys
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'stream-platform')
OUT = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') \
    else os.path.join(ROOT, 'deliverables', '项目源码包.zip')

SKIP_DIRS = {'target', 'node_modules', 'dist', '.export_tmp', '__pycache__',
             '.git', '.idea', '.vscode', 'logs', 'coverage'}
SKIP_EXT = {'.log', '.tsbuildinfo', '.class', '.jar', '.pyc'}


def keep(rel):
    parts = rel.split('/')
    if any(p in SKIP_DIRS for p in parts[:-1]):
        return False
    name = parts[-1]
    ext = os.path.splitext(name)[1].lower()
    if ext in SKIP_EXT:
        return False
    if name.endswith('.csv') and '/data/' in '/' + rel:
        return False
    return True


def collect():
    files = []
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, SRC).replace(os.sep, '/')
            if keep(rel):
                files.append((full, rel))
    files.sort(key=lambda x: x[1])
    return files


def check(files):
    """体检：包里是否缺文件 / 是否落后于磁盘源码。返回退出码。"""
    if not os.path.isfile(OUT):
        print(f'✗ 源码包不存在：{OUT}（请先运行 python pack_source.py）')
        return 1
    problems = 0
    with zipfile.ZipFile(OUT) as z:
        infos = {i.filename: i for i in z.infolist()}
        names = {n[len('stream-platform/'):]: n for n in infos if n.startswith('stream-platform/')}

        missing = [rel for _, rel in files if rel not in names]
        if missing:
            problems += 1
            print(f'✗ 包内缺少 {len(missing)} 个磁盘上已存在的文件：')
            for rel in missing[:8]:
                print(f'    {rel}')

        stale = []
        for _, rel in files:
            if rel not in names:
                continue
            zi = infos[names[rel]]
            zt = time.mktime((zi.date_time[0], zi.date_time[1], zi.date_time[2],
                               zi.date_time[3], zi.date_time[4], zi.date_time[5], 0, 0, -1))
            gap = os.path.getmtime(os.path.join(SRC, rel)) - zt
            if gap > 2:
                stale.append((gap, rel))
        if stale:
            problems += 1
            print(f'✗ 包内 {len(stale)} 个文件已落后于磁盘源码（源码更新更晚）：')
            for gap, rel in sorted(stale, key=lambda x: -x[0])[:8]:
                print(f'    滞后 {int(gap)}s  {rel}')

    if problems:
        print('\n→ 源码包已过期，请重新运行：python pack_source.py')
        return 1
    print(f'✓ 源码包与磁盘源码一致（{len(files)} 个文件）')
    return 0


def main():
    files = collect()
    if '--check' in sys.argv:
        return check(files)

    # 文本文件统一按 LF 入库。工作区若是 CRLF（Windows 上 core.autocrlf=true 检出常见），
    # 直接 z.write 会把 CRLF 带进包里，与外层源码树不一致 —— 评审复验抓到过 22 处。
    # 二进制原样写入，误做行尾替换会损坏文件。
    binary_ext = ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.docx', '.xlsx', '.zip',
                  '.gz', '.mp4', '.jar', '.pdf', '.woff', '.woff2', '.ttf')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    normalized = 0
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for full, rel in files:
            with open(full, 'rb') as fh:
                data = fh.read()
            if not rel.lower().endswith(binary_ext):
                fixed = data.replace(b'\r\n', b'\n')
                if fixed != data:
                    normalized += 1
                data = fixed
            # 保留原文件时间戳：--check 靠 zip 条目时间与磁盘 mtime 的差值判断是否落后，
            # 用 writestr 默认的「当前时间」会让体检永远通过、失去意义。
            info = zipfile.ZipInfo('stream-platform/' + rel,
                                   date_time=time.localtime(os.path.getmtime(full))[:6])
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)
    if normalized:
        print(f'行尾归一化: {normalized} 个文件由 CRLF 转为 LF')

    java = [r for _, r in files if r.endswith('.java')]
    ts = [r for _, r in files if r.endswith(('.ts', '.tsx'))]
    print(f'输出      : {OUT}')
    print(f'大小      : {os.path.getsize(OUT)} 字节 ({os.path.getsize(OUT) / 1024:.1f} KB)')
    print(f'条目数    : {len(files)}')
    print(f'.java     : {len(java)} 个')
    print(f'.ts/.tsx  : {len(ts)} 个')
    for key in ('JdbcShardSql.java', 'JdbcShardSqlTest.java', 'JdbcShardIntegrationTest.java',
                'theme/palette.ts', 'theme/home.ts', 'export_docx.py', 'make_figures.py',
                'pack_source.py', 'docx_audit.py', 'README-export.md', 'pandoc-reference.docx'):
        hit = [r for _, r in files if r.endswith(key)]
        print(f'  含 {key:32s} {"✓ " + hit[0] if hit else "✗ 缺失"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
