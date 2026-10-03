# -*- coding: utf-8 -*-
"""md(源) -> docx(交付物) 导出链路。

背景：交付物 docx 原先由 pandoc + 默认 reference.docx 生成，但导出脚本未入库，
导致 md 源修好后 docx 长期停留在旧版（同一个坑踩过两次）。本脚本把该链路固化下来。

用法：
    python export_docx.py                 # 导出全部 5 份
    python export_docx.py --only 概要设计  # 只导名称含该子串的文档
    python export_docx.py --pandoc /path/to/pandoc.exe

依赖：
    - pandoc（见 PANDOC 环境变量或 --pandoc；Windows 便携版默认路径见下）
    - stream-platform/scripts/pandoc-reference.docx（由
      `pandoc --print-default-data-file reference.docx` 生成，与原交付物样式一致）
"""
import argparse
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))          # 仓库根
DOCS = os.path.join(ROOT, 'docs')
REF = os.path.join(HERE, 'pandoc-reference.docx')
OUTDIR = os.path.join(ROOT, 'deliverables')
# 合册用的临时 md 落地目录（覆盖写入，不删除，规避沙箱对删除操作的拦截）
TMPDIR = os.path.join(HERE, '.export_tmp')

DEFAULT_PANDOC = [
    os.environ.get('PANDOC'),
    r'C:\Users\zndsn\.workbuddy\binaries\pandoc\pandoc-3.12\pandoc.exe',
    shutil.which('pandoc'),
]

# 与交付物一一对应的源文件清单（顺序即合册顺序）
MANIFEST = [
    dict(out='项目创意与价值分析.docx',
         sources=['docs/00-项目创意与价值分析.md'],
         page_break_between=False),
    dict(out='概要设计说明书.docx',
         sources=['docs/01-概要设计.md'],
         page_break_between=False),
    dict(out='数据库设计说明书.docx',
         sources=['docs/02-数据库设计.md'],
         page_break_between=False),
    dict(out='部署文档.docx',
         sources=['stream-platform/deploy/README-deploy.md'],
         page_break_between=False),
    dict(out='性能测试报告.docx',
         sources=['docs/05-性能测试报告.md'],
         page_break_between=False),
    dict(out='完整测试报告.docx',
         sources=['docs/13-测试报告-合册-头部.md',
                  'docs/08-端到端集成测试报告.md',
                  'docs/10-输入输出控件测试报告.md',
                  'docs/11-处理控件测试报告.md',
                  'docs/12-数据质量与异常测试报告.md'],
         page_break_between=True),
]

# gfm 语义 + 表格 + 代码块 + 删除线 + 任务列表 + 原始 openxml（用于插入分页符）
FORMAT = ('markdown+pipe_tables+fenced_code_blocks+backtick_code_blocks'
          '+strikeout+task_lists+raw_attribute+smart')

PAGE_BREAK = ('\n\n```{=openxml}\n'
              '<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n'
              '```\n\n')


def find_pandoc(cli=None):
    for cand in ([cli] if cli else []) + DEFAULT_PANDOC:
        if cand and os.path.isfile(cand):
            return cand
    if cli is None:
        for cand in DEFAULT_PANDOC:
            if cand:
                return cand
    raise SystemExit('找不到 pandoc，请用 --pandoc 指定路径，或设置 PANDOC 环境变量。')


def build_source(sources, page_break_between, tmpdir, name):
    """把多份 md 合成一份临时 md；可选在文件间插入分页符。"""
    src_paths = [os.path.join(ROOT, s.replace('/', os.sep)) for s in sources]
    for p in src_paths:
        if not os.path.isfile(p):
            raise SystemExit(f'源文件不存在: {p}')
    if len(src_paths) == 1:
        return src_paths[0]
    chunks = []
    for i, p in enumerate(src_paths):
        with open(p, encoding='utf-8') as fh:
            chunks.append(fh.read().rstrip() + '\n')
        if page_break_between and i < len(src_paths) - 1:
            chunks.append(PAGE_BREAK)
    tmp = os.path.join(tmpdir, name + '.merged.md')
    with open(tmp, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(chunks))
    return tmp


def run(pandoc, src, out, verbose=True):
    # --resource-path=docs：pandoc 按「工作目录」解析相对资源，统一到仓库根的 docs/ 下找 figures/
    cmd = [pandoc,
           '-f', FORMAT,
           '-t', 'docx',
           '-s',
           '--toc', '--toc-depth=3',
           '--resource-path=docs',
           '--reference-doc=' + REF,
           src,
           '-o', out]
    if verbose:
        print('    ' + ' '.join(cmd))
    return subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)


def postprocess(path):
    """pandoc 产出的 TOC 是空域，Word 打开时不会自动填充；且标题为英文。
    这里做两件事（均为纯文本级替换，不改动其他内容）：
      1) 在 settings.xml 注入 <w:updateFields w:val="true"/> —— Word 打开即自动更新目录；
         插入位置在 w:rsids 之前（符合 CT_Settings 的元素顺序）。
      2) 把目录标题 "Table of Contents" 改为 "目录"。
    """
    import zipfile
    with zipfile.ZipFile(path) as z:
        order = z.namelist()
        items = {n: z.read(n) for n in order}

    changed = []

    st = items.get('word/settings.xml')
    if st is not None:
        s = st.decode('utf-8')
        if 'updateFields' not in s:
            if '<w:rsids' in s:
                s = s.replace('<w:rsids', '<w:updateFields w:val="true"/><w:rsids', 1)
            else:
                s = s.replace('</w:settings>', '<w:updateFields w:val="true"/></w:settings>', 1)
            items['word/settings.xml'] = s.encode('utf-8')
            changed.append('updateFields')

    dn = 'word/document.xml'
    if dn in items:
        d = items[dn].decode('utf-8')
        for pat in ('<w:t>Table of Contents</w:t>',
                    '<w:t xml:space="preserve">Table of Contents</w:t>'):
            if pat in d:
                d = d.replace(pat, '<w:t>目录</w:t>')
                changed.append('目录标题')
                break
        items[dn] = d.encode('utf-8')

    # 重写 zip：保持原有条目顺序（[Content_Types].xml 置首）
    if order and order[0] != '[Content_Types].xml' and '[Content_Types].xml' in order:
        order = ['[Content_Types].xml'] + [n for n in order if n != '[Content_Types].xml']
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in order:
            z.writestr(n, items[n])
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pandoc')
    ap.add_argument('--only')
    args = ap.parse_args()

    pandoc = find_pandoc(args.pandoc)
    if not os.path.isfile(REF):
        raise SystemExit(f'缺少 reference 模板: {REF}')
    print(f'pandoc  : {pandoc}')
    print(f'根目录  : {ROOT}')
    os.makedirs(OUTDIR, exist_ok=True)

    ok = 0
    os.makedirs(TMPDIR, exist_ok=True)
    for item in MANIFEST:
        if args.only and args.only not in item['out']:
            continue
        out = os.path.join(OUTDIR, item['out'])
        print(f'>> {item["out"]}')
        src = build_source(item['sources'], item['page_break_between'],
                           TMPDIR, os.path.splitext(item['out'])[0])
        res = run(pandoc, src, out)
        if res.returncode != 0:
            print(f'   !! 失败: {res.stderr.strip()}')
            continue
        changed = postprocess(out)
        size = os.path.getsize(out)
        print(f'   ok  {out}  ({size} 字节)  后处理: {", ".join(changed) or "无"}')
        ok += 1
    print(f'\n完成：{ok} 份导出成功。')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
