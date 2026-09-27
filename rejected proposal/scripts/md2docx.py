"""Markdown → Word(.docx) 转换（轻量实现，覆盖本项目文档所用语法）

支持：# 标题、普通段落、**粗体**、`行内代码`、- 无序列表、1. 有序列表、
      | 表格 |、``` 代码块、--- 分隔线。

用法：
    python md2docx.py 输入.md [输出.docx]
    python md2docx.py --all          # 批量转换 scripts/../docs 下的约定文档
"""

import os
import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.shared import Pt, RGBColor

CODE_FONT = "Consolas"
CODE_BG = RGBColor(0x33, 0x33, 0x33)


def add_inline(par, text):
    """把 **粗体** 与 `行内代码` 渲染进段落"""
    # 按 ** 与 ` 拆分成 token
    for token in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
        if not token:
            continue
        if token.startswith("**") and token.endswith("**") and len(token) > 4:
            run = par.add_run(token[2:-2])
            run.bold = True
        elif token.startswith("`") and token.endswith("`") and len(token) > 2:
            run = par.add_run(token[1:-1])
            run.font.name = CODE_FONT
            run.font.color.rgb = CODE_BG
        else:
            par.add_run(token)


def convert(md_text, docx_path, title=None):
    doc = Document()

    # 正文默认字体（中文回退由 Word 处理）
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(10.5)

    lines = md_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # ---- 代码块 ----
        if stripped.startswith("```"):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1  # 跳过结束 ```
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(8)
            run = p.add_run("\n".join(buf))
            run.font.name = CODE_FONT
            run.font.size = Pt(9)
            continue

        # ---- 表格 ----
        if stripped.startswith("|") and i + 1 < len(lines) and re.match(
            r"^\|[\s:\-|]+\|$", lines[i + 1].strip()
        ):
            header = [c.strip() for c in stripped.strip("|").split("|")]
            i += 2  # 跳过表头与分隔行
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            table = doc.add_table(rows=1, cols=len(header))
            table.style = "Light Grid Accent 1"
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            for j, h in enumerate(header):
                cell = table.rows[0].cells[j]
                cell.text = ""
                add_inline(cell.paragraphs[0], h)
                for r in cell.paragraphs[0].runs:
                    r.bold = True
            for row in rows:
                cells = table.add_row().cells
                for j, v in enumerate(row[: len(header)]):
                    cells[j].text = ""
                    add_inline(cells[j].paragraphs[0], v)
            doc.add_paragraph()  # 表格后留空
            continue

        # ---- 标题 ----
        m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            doc.add_heading(m.group(2), level=min(level, 4))
            i += 1
            continue

        # ---- 分隔线 ----
        if re.match(r"^-{3,}$", stripped) or re.match(r"^\*{3,}$", stripped):
            i += 1
            continue

        # ---- 引用块 ----
        if stripped.startswith(">"):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Pt(18)
            add_inline(p, stripped.lstrip("> ").strip())
            for r in p.runs:
                r.italic = True
            i += 1
            continue

        # ---- 列表 ----
        m = re.match(r"^(\s*)[-*]\s+(.*)$", line)
        if m:
            p = doc.add_paragraph(style="List Bullet")
            add_inline(p, m.group(2))
            i += 1
            continue
        m = re.match(r"^(\s*)\d+\.\s+(.*)$", line)
        if m:
            p = doc.add_paragraph(style="List Number")
            add_inline(p, m.group(2))
            i += 1
            continue

        # ---- 空行 ----
        if not stripped:
            i += 1
            continue

        # ---- 普通段落 ----
        p = doc.add_paragraph()
        add_inline(p, stripped)
        i += 1

    doc.save(docx_path)
    return docx_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    if sys.argv[1] == "--all":
        root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
        out_dir = os.path.join(root, "deliverables")
        os.makedirs(out_dir, exist_ok=True)
        # md 源文件 → deliverables/ 下的正式 Word 交付物
        pairs = [
            ("源码/技术方案.md", "技术方案.docx"),
            ("源码/docs/数据库设计.md", "数据库设计说明书.docx"),
            ("源码/docs/冒烟测试报告.md", "冒烟测试报告.docx"),
        ]
        for src, dst in pairs:
            s = os.path.join(root, src)
            d = os.path.join(out_dir, dst)
            if not os.path.exists(s):
                print(f"  跳过（不存在）: {src}")
                continue
            convert(open(s, encoding="utf-8").read(), d)
            print(f"  ✓ {src}  ->  deliverables/{dst}")
    else:
        src = sys.argv[1]
        dst = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(src)[0] + ".docx"
        convert(open(src, encoding="utf-8").read(), dst)
        print(f"✓ {src} -> {dst}")
