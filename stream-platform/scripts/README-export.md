# 文档交付链路（md 源 → docx 交付物）

> 本目录下的三个脚本把 `docs/` 里的 Markdown **源**导出为 `deliverables/` 里的 **docx 交付物**，
> 并对导出结果做硬伤关键词校验。编写这些脚本的原因是：**交付物 docx 长期与 md 源脱节**
> （md 改完、docx 没重导，评委看到的仍是旧版），同一个坑此前已踩过两次。

## 一、链路总览

```
docs/**.md  ──┐
              ├─►  export_docx.py（pandoc + reference.docx）  ──►  deliverables/*.docx
docs/figures/ ┘                                                      │
                                                                     ▼
                                              docx_audit.py  ──►  硬伤关键词校验（须全过）
```

| 脚本 | 作用 |
|---|---|
| `make_figures.py` | 用 matplotlib 生成 10 张插图到 `docs/figures/`（架构 / 数据流 / 流水线 / 状态机 / ER / 性能 / 部署 / DAG / 竞品 / 成本） |
| `export_docx.py` | 把 md 源导出为 6 份 docx（含合册与分页、目录自动更新、目录标题中文化） |
| `docx_audit.py` | 解压 docx 的 `word/document.xml`，检查硬伤关键词是否残留 |
| `pandoc-reference.docx` | 样式模板（`pandoc --print-default-data-file reference.docx` 生成，与原交付物样式一致） |

## 二、依赖

- **pandoc**（必需）。本机便携版路径：
  `C:\Users\zndsn\.workbuddy\binaries\pandoc\pandoc-3.12\pandoc.exe`
  可用 `--pandoc` 指定，或设 `PANDOC` 环境变量。
  下载（本机 github TLS 需跳过校验）：
  ```bash
  curl -k -L -o pandoc.zip \
    https://github.com/jgm/pandoc/releases/download/3.12/pandoc-3.12-windows-x86_64.zip
  ```
- **Python 3.13**（matplotlib 用于画图；python-docx 用于审计）。本机 venv：
  - 画图：`C:\Users\zndsn\.workbuddy\binaries\python\envs\default\Scripts\python.exe`
  - 审计：`C:\Users\zndsn\.workbuddy\binaries\python\envs\htmldocx\Scripts\python.exe`

## 三、标准流程（改文档后必须按序执行）

```bash
# 0) 目录：所有命令在仓库根（含 docs/ 与 deliverables/ 的那一层）执行

# 1) 如需改图：重生插图
"…/envs/default/Scripts/python.exe"   stream-platform/scripts/make_figures.py

# 2) 导出全部 docx（也可 --only 概要设计 只导一份）
"…/envs/htmldocx/Scripts/python.exe"  stream-platform/scripts/export_docx.py

# 3) 硬伤关键词校验 —— 必须输出「全部 FAIL 项通过」
"…/envs/htmldocx/Scripts/python.exe"  stream-platform/scripts/docx_audit.py deliverables
```

## 四、交付物 ↔ 源文件 对应关系

| 交付物 docx | 源 md |
|---|---|
| 项目创意与价值分析.docx | `docs/00-项目创意与价值分析.md` |
| 概要设计说明书.docx | `docs/01-概要设计.md` |
| 数据库设计说明书.docx | `docs/02-数据库设计.md` |
| 部署文档.docx | `stream-platform/deploy/README-deploy.md` |
| 性能测试报告.docx | `docs/05-性能测试报告.md` |
| 完整测试报告.docx | `docs/13` + `docs/08` + `docs/10` + `docs/11` + `docs/12`（合册，各文件间插入分页符） |

## 五、几个实现要点（改脚本前先看）

1. **图片路径**：md 里统一写 `figures/xxx.png`。pandoc 按**工作目录**解析相对资源，
   故导出时固定 `cwd=仓库根` 且传 `--resource-path=docs`——这样 `docs/**`、
   `stream-platform/deploy/README-deploy.md`、以及合册的临时合并文件都能找到同一批图。
2. **合册**：多份 md 先合并为一个临时文件（`stream-platform/scripts/.export_tmp/`，
   已被 .gitignore 忽略）再交给 pandoc；用 `raw_attribute` 语法在文件之间插入
   `<w:br w:type="page"/>` 实现分页。
3. **目录（TOC）**：pandoc 产出的是**空域**，Word 打开不会自动填充。脚本后处理两步：
   ① 在 `settings.xml` 注入 `<w:updateFields w:val="true"/>`（插在 `w:rsids` 之前，符合
   元素顺序），使 Word 打开即自动生成目录；② 把目录标题 `Table of Contents` 改为 `目录`。
4. **不要手动改 docx**：docx 是产物，任何内容修订都应改 md 后重跑本链路，否则又会脱节。

## 六、常见问题

| 现象 | 原因 / 处理 |
|---|---|
| docx 里图片缺失 | 未在仓库根运行，或漏了 `--resource-path=docs` |
| 目录打开是空白 | `settings.xml` 缺 `updateFields`（脚本漏跑后处理）——重跑导出 |
| 校验报 `sys_user` | md 里写了裸表名，应为 `sp_sys_user` |
| 校验报 `近线性` | 与实测加速比（1.7× / 2.8×）口径不符，应改为「有明显提升」并引用《性能测试报告》§4.2 |
