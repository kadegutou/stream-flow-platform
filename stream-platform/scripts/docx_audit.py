# -*- coding: utf-8 -*-
"""docx 硬伤关键词普查。

直接解压 docx 的 word/document.xml（正文）与页眉/页脚/脚注，检查下列硬伤是否残留。
用法: python docx_audit.py <deliverables 目录>

判定分两类：
  FAIL —— 出现即不合格（对应《整改清单》P2-2 的 11 处硬伤）
  INFO —— 仅打印上下文供人工确认（这些词在"已修复说明"里合法出现）
"""
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = NS['w']

# (显示名, 正则, 作用范围 None=全部 docx)
FAIL = [
    ('文档水印 DRAFT',            r'DRAFT',                     ['概要设计说明书.docx']),
    ('裸表名 sys_user',           r'(?<!sp_)sys_user',          ['数据库设计说明书.docx', '概要设计说明书.docx']),
    ('裸表名 component_def',      r'(?<!sp_)component_def',     None),
    ('裸表名 job_instance',       r'(?<!sp_)job_instance',      None),
    ('裸表名 job_shard',          r'(?<!sp_)job_shard',         None),
    ('裸表名 worker_node',        r'(?<!sp_)worker_node',       None),
    ('裸表名 job_metric',         r'(?<!sp_)job_metric',        None),
    ('裸表名 job.dag_json',       r'(?<!sp_)job\.dag_json',     None),
    ('调度器每 10s',              r'每\s*10s',                  ['数据库设计说明书.docx']),
    ('内网 IP 10.161.129',        r'10\.161\.129',              None),
    ('内网 IP 192.168.xx',        r'192\.168\.',                None),
    ('仓库地址占位符',            r'<\s*仓库地址\s*>',          None),
    ('吞吐近线性（口径不符）',    r'近线性',                    None),
]

INFO = [
    ('空文件',   r'空文件'),
    ('机械盘',   r'机械盘'),
    ('10.161',   r'10\.161'),
    ('DRAFT 字样', r'DRAFT'),
]


def docx_text(path):
    parts = []
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if re.match(r'word/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$', name):
                try:
                    root = ET.fromstring(z.read(name))
                except Exception:
                    continue
                for t in root.iter('{%s}t' % W):
                    parts.append(t.text or '')
                parts.append('\n')
    return ''.join(parts)


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else '.'
    files = sorted(f for f in os.listdir(d) if f.endswith('.docx'))
    texts = {f: docx_text(os.path.join(d, f)) for f in files}

    print('== docx 文件 ==')
    for f in files:
        print(f'   {f}  ({len(texts[f])} 字符)')
    print()

    bad = 0
    print('== FAIL 项 ==')
    for label, pat, scope in FAIL:
        targets = scope if scope else files
        hits = []
        for f in targets:
            if f not in texts:
                continue
            ms = list(re.finditer(pat, texts[f]))
            if ms:
                m = ms[0]
                ctx = texts[f][max(0, m.start() - 22):m.end() + 22].replace('\n', '⏎')
                hits.append(f'{f} ×{len(ms)}  …{ctx}…')
        if hits:
            bad += 1
            print(f'  [✗] {label}')
            for h in hits:
                print('        ' + h)
        else:
            print(f'  [✓] {label}  未出现')

    print()
    print('== INFO 项（人工确认，不计入失败）==')
    for label, pat in INFO:
        for f in files:
            n = len(re.findall(pat, texts[f]))
            if n:
                m = re.search(pat, texts[f])
                ctx = texts[f][max(0, m.start() - 22):m.end() + 22].replace('\n', '⏎')
                print(f'  [i] {label}  {f} ×{n}  …{ctx}…')

    print()
    if bad:
        print(f'== 结论: {bad} 个 FAIL 项命中，未通过 ==')
    else:
        print('== 结论: 全部 FAIL 项通过 ==')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
