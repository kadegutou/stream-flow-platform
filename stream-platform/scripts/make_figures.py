# -*- coding: utf-8 -*-
"""生成交付文档所需插图（PNG），输出到 docs/figures/。

全部使用 matplotlib 矢量绘制（无外部图形依赖），中文字体取 Microsoft YaHei。
运行: python make_figures.py
"""
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

plt.rcParams['font.sans-serif'] = ['Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'figures')

C_FE = '#722ed1'
C_CP = '#2f54eb'
C_DP = '#13c2c2'
C_ST = '#8c8c8c'
C_SRC = '#13a8a8'
C_PROC = '#2f54eb'
C_SINK = '#fa8c16'
C_EXT = '#d46b08'
C_TXT = '#1f1f1f'
C_LINE = '#595959'
C_OK = '#52c41a'
C_WARN = '#d4380d'


def rbox(ax, x, y, w, h, text, fc, fs=10, tc='white', bold=True,
         ec='none', lw=1.2, radius=1.2, z=2, ls='-', align='center'):
    patch = FancyBboxPatch(
        (x, y), w, h, boxstyle=f'round,pad=0,rounding_size={radius}',
        linewidth=lw, edgecolor=(fc if ec == 'none' else ec),
        facecolor=fc, zorder=z, linestyle=ls)
    ax.add_patch(patch)
    if text:
        ha = 'center' if align == 'center' else 'left'
        tx = x + w / 2 if align == 'center' else x + 1.6
        ax.text(tx, y + h / 2, text, ha=ha, va='center',
                fontsize=fs, color=tc, weight='bold' if bold else 'normal',
                zorder=z + 1, linespacing=1.75)
    return patch


def arrow(ax, p1, p2, color=C_LINE, lw=1.4, rad=0.0, ls='-',
          style='-|>', ms=13, z=1):
    ax.add_patch(FancyArrowPatch(
        p1, p2, arrowstyle=style, mutation_scale=ms, color=color, lw=lw,
        zorder=z, connectionstyle=f'arc3,rad={rad}', linestyle=ls,
        shrinkA=2, shrinkB=2))


def label(ax, x, y, text, fs=9, color=C_LINE, ha='center', va='center',
          weight='normal', bg='white', z=8):
    kw = dict(bbox=dict(boxstyle='round,pad=0.24', fc=bg, ec='none', alpha=0.96)) if bg else {}
    ax.text(x, y, text, ha=ha, va=va, fontsize=fs, color=color,
            weight=weight, zorder=z, linespacing=1.5, **kw)


def canvas(w, h):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100 * h / w)
    ax.axis('off')
    fig.patch.set_facecolor('white')
    return fig, ax, 100 * h / w


def save(fig, name):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    fig.savefig(p, dpi=200, bbox_inches='tight', facecolor='white', pad_inches=0.12)
    plt.close(fig)
    print(f'  {name}  {os.path.getsize(p)} 字节')


# ---------------------------------------------------------------- 图 1 总体架构
def fig_arch():
    fig, ax, H = canvas(11, 9.6)

    # 前端
    rbox(ax, 3, 76, 94, 10.5, '', C_FE)
    label(ax, 50, 84.0, '前端　React SPA（可视化编排入口）', fs=11.5, color='white', weight='bold', bg=None)
    for i, t in enumerate(['作业画布\nReact Flow', '用户管理', '控件管理', '运行监控']):
        rbox(ax, 6 + i * 23, 77.2, 21, 5.4, t, '#9254de', fs=8.4)

    # 控制面
    rbox(ax, 3, 53, 94, 18, '', C_CP)
    label(ax, 50, 68.2, '控制面　Control Plane（Spring Boot 3 · 8080 · 无状态可多副本）',
          fs=11.5, color='white', weight='bold', bg=None)
    for i, t in enumerate(['用户服务\nCRUD / JWT 鉴权', '控件服务\n参数 Schema 下发',
                           '作业服务\nCRUD / DAG 校验', '调度器\n分片派发 / 状态收敛']):
        rbox(ax, 6 + i * 23, 54.6, 21, 8.0, t, '#597ef7', fs=8.4)

    # 存储与协调（留出两侧竖直通道给控制流箭头）
    rbox(ax, 16, 43, 31, 7, 'MySQL 8　元数据 + 调度协调\n（心跳表 / 状态字段 + 乐观锁）', C_ST, fs=8.8)
    rbox(ax, 53, 43, 31, 7, 'Redis 7（可选）\n心跳缓存 / 分布式锁 / 补数数据源',
         '#bfbfbf', fs=8.8, tc=C_TXT)

    # 数据面
    rbox(ax, 3, 14, 94, 23, '', C_DP)
    label(ax, 50, 34.4, '数据面　Data Plane（Worker 集群 · 无状态 · 8081+ · --scale 扩容）',
          fs=11.5, color='white', weight='bold', bg=None)
    for i in range(3):
        x = 6 + i * 31
        rbox(ax, x, 15.4, 29, 16, '', '#36cfc9', z=3)
        label(ax, x + 14.5, 28.4, f'Worker {i + 1}', fs=9.6, color='white', bg=None, weight='bold')
        label(ax, x + 14.5, 24.4, 'Agent：注册 / 心跳 / 拉任务 / 上报', fs=7.4, color='#00474f', bg=None)
        label(ax, x + 14.5, 20.6, '执行引擎', fs=7.6, color='#00474f', bg=None, weight='bold')
        label(ax, x + 14.5, 17.6, 'Source →(队列)→ Process →(队列)→ Sink', fs=7.0, color='#00474f', bg=None)

    # 外部数据源
    rbox(ax, 3, 2, 94, 8.5, '', C_EXT)
    label(ax, 50, 8.6, '外部数据源 / 目标端', fs=10.2, color='white', weight='bold', bg=None)
    for i, t in enumerate(['MySQL', 'PostgreSQL', 'Oracle', 'Kafka', 'Redis', 'HDFS', 'CSV / Excel']):
        rbox(ax, 5 + i * 13.2, 3.0, 12, 4.2, t, '#faad14', fs=8.0, radius=0.9)

    arrow(ax, (50, 76), (50, 71.5), lw=1.8, ms=15)
    label(ax, 64, 73.7, 'REST / JSON（JWT 鉴权）', fs=8.8)
    arrow(ax, (31, 53), (31, 50), lw=1.4, style='<|-|>', ms=10)
    label(ax, 26, 51.5, '读写元数据', fs=8.0)
    arrow(ax, (9.5, 37), (9.5, 53), rad=0.26, lw=1.8)
    label(ax, 9.5, 45.0, '注册 / 心跳 / 上报', fs=7.4, ha='center')
    arrow(ax, (90.5, 53), (90.5, 37), rad=-0.26, lw=1.8)
    label(ax, 90.5, 51.5, '派发分片', fs=8.0)
    arrow(ax, (50, 14), (50, 10.8), lw=1.8, ms=15)
    label(ax, 64, 12.4, '批量读写（缓冲 I/O）', fs=8.8)
    save(fig, 'fig-01-总体架构.png')


# ------------------------------------------------------- 图 2 应用数据流图（DFD）
def fig_dfd():
    fig, ax, H = canvas(11, 7.0)
    label(ax, 50, 61.0, '应用数据流图：控制流（编排 / 调度）与数据流（读 → 加工 → 写）',
          fs=11.2, color=C_TXT, weight='bold', bg=None)

    # ---- 上排：控制流 ----
    rbox(ax, 3, 44, 26, 11, '前端编排\n拖拽生成 DAG\nJSON Schema 动态表单', C_FE, fs=8.2)
    rbox(ax, 37, 44, 26, 11, '控制面\nDAG 校验 · 版本 · 上线\n调度器：分片派发', C_CP, fs=8.2)
    rbox(ax, 71, 44, 26, 11, 'Worker 集群\n（无状态 · 心跳 30s · 故障重派）', C_DP, fs=8.2)

    arrow(ax, (29, 49.5), (37, 49.5), lw=1.9, ms=15)
    label(ax, 33, 53.4, 'DAG JSON', fs=8.0, bg=None)
    arrow(ax, (63, 49.5), (71, 49.5), lw=1.9, ms=15)
    label(ax, 67, 53.4, '派发分片', fs=8.0, bg=None)
    # 回流：Worker → 控制面（走中间空白带；arc3 的 rad 符号决定凸向，此处取负使弧线下垂）
    arrow(ax, (84, 44), (50, 44), rad=-0.34, lw=1.8, ls='--')
    label(ax, 67, 30.5, '心跳 / 状态上报 / 指标', fs=8.2, color=C_LINE, weight='bold')

    # ---- 下排：数据流 ----
    rbox(ax, 2, 14, 15, 12, '数据源\nMySQL\nKafka\nCSV / Excel\nHDFS', C_EXT, fs=7.8)
    rbox(ax, 21, 14, 15, 12, '输入控件\nSOURCE', C_SRC, fs=9.2)
    rbox(ax, 40, 14, 15, 12, '处理控件\nPROCESS\n拼接 / 映射\n脱敏 / 补数', C_PROC, fs=8.2)
    rbox(ax, 59, 14, 15, 12, '输出控件\nSINK', C_SINK, fs=9.2)
    rbox(ax, 78, 14, 20, 12, '目标端\nMySQL\nKafka / HDFS\nCSV 分文件', C_EXT, fs=7.8)

    arrow(ax, (17, 20), (21, 20), lw=2.2, ms=16)
    arrow(ax, (36, 20), (40, 20), lw=2.4, ms=16)
    label(ax, 38, 28.6, 'List<Row>', fs=7.8, weight='bold')
    arrow(ax, (55, 20), (59, 20), lw=2.4, ms=16)
    arrow(ax, (74, 20), (78, 20), lw=2.2, ms=16)

    label(ax, 50, 9.2, '读取支持分片切片；断点续传按源区分：CSV（字节偏移）/ Excel（行号）/ Kafka（消费位点）支持，'
                       'HDFS 与 JDBC 源不支持（分片 ≠ 断点，见概要设计 §7.1）',
          fs=7.8, color=C_LINE, bg=None)
    label(ax, 50, 3.6, '输入 / 处理 / 输出控件均通过统一 SPI 接口接入，参数由 JSON Schema 声明，前端表单自动渲染；'
                       '写出支持 .partN 分文件与幂等',
          fs=7.8, color=C_LINE, bg=None)
    save(fig, 'fig-02-应用数据流图.png')


# ------------------------------------------------------------ 图 3 执行流水线
def fig_pipeline():
    fig, ax, H = canvas(11, 4.8)
    y, h = 16, 12
    rbox(ax, 2, y, 15, h, 'Source 线程\n批量读 5000 行/批\n8MB 缓冲 I/O', C_SRC, fs=8.4)
    rbox(ax, 25, y, 14, h, '有界队列 Q1\n64 批 × 5000 行', '#fff1b8', fs=8.2, tc=C_TXT, ec='#faad14')
    rbox(ax, 47, y, 15, h, 'Process 线程\n过处理链\n拼接/映射/脱敏', C_PROC, fs=8.4)
    rbox(ax, 70, y, 14, h, '有界队列 Q2\n64 批 × 5000 行', '#fff1b8', fs=8.2, tc=C_TXT, ec='#faad14')
    rbox(ax, 88, y, 10, h, 'Sink 线程\n批量写\nbatch insert', C_SINK, fs=8.4, radius=1.0)
    for x1, x2 in [(17, 25), (39, 47), (62, 70), (84, 88)]:
        arrow(ax, (x1, y + h / 2), (x2, y + h / 2), lw=2.2, ms=16)

    label(ax, 50, 41.5, '三段流水线（JDK 21 虚拟线程）　总吞吐 = 最慢环节，而非各环节之和',
          fs=10.4, color=C_TXT, weight='bold', bg=None)
    arrow(ax, (32, y + h), (32, 34.5), color=C_WARN, lw=1.8)
    label(ax, 32, 36.6, '队列满 → 背压', fs=8.8, color=C_WARN, weight='bold', bg=None)
    label(ax, 50, 8.5, '内存恒定：5000 万行（5.9GB）全程 Worker 堆稳定在 4GB 限额内，无 OOM',
          fs=8.8, color=C_LINE, bg=None)
    save(fig, 'fig-03-执行流水线.png')


# ------------------------------------------------------------ 图 4 状态机
def fig_state():
    fig, ax, H = canvas(10, 5.8)
    bw, bh = 22, 11
    pos = {'PENDING': (30, 42), 'RUNNING': (64, 42), 'STOPPING': (64, 23),
           'STOPPED': (30, 23), 'FAILED': (64, 4)}
    tips = {'PENDING': '待运行', 'RUNNING': '运行中', 'STOPPING': '停止中',
            'STOPPED': '已停止', 'FAILED': '失败'}
    cols = {'PENDING': '#faad14', 'RUNNING': C_OK, 'STOPPING': '#fa8c16',
            'STOPPED': C_ST, 'FAILED': C_WARN}
    for k, (x, y) in pos.items():
        rbox(ax, x, y, bw, bh, f'{tips[k]}\n{k}', cols[k], fs=9.4)

    arrow(ax, (52, 47.5), (64, 47.5), lw=1.8, ms=14)
    label(ax, 58, 51.2, 'Worker 领取', fs=8.2)
    arrow(ax, (75, 42), (75, 34), lw=1.8, ms=14)
    label(ax, 81.5, 38, '下线', fs=8.2)
    arrow(ax, (64, 28.5), (52, 28.5), lw=1.8, ms=14)
    label(ax, 58, 32.0, 'Worker 确认退出', fs=8.0)
    arrow(ax, (34, 34), (34, 42), rad=0.30, lw=1.6, ls='--')
    label(ax, 23, 38, '重新上线', fs=8.2)
    # 异常：RUNNING → FAILED（从右侧绕行，避开 STOPPING）
    arrow(ax, (86, 46), (86, 13), rad=-0.55, lw=1.6, ls='--', color=C_WARN)
    label(ax, 95, 29.5, '异常', fs=8.2, color=C_WARN, weight='bold', bg=None)
    label(ax, 50, 0.6, '作业实例状态机　（分片状态同为 PENDING / RUNNING / STOPPING / STOPPED / FAILED）',
          fs=8.4, color=C_LINE, bg=None)
    save(fig, 'fig-04-状态机.png')


# ------------------------------------------------------------ 图 5 ER 图
def fig_er():
    fig, ax, H = canvas(11, 7.7)   # H = 70

    def entity(x, y, w, n_fields, title, fields, color, fs_t=9.2, fs_f=6.8, spacing=2.1):
        h = 6.2 + (n_fields - 1) * spacing          # 依据字段数自适应高度
        rbox(ax, x, y, w, h, '', color, radius=1.0)
        label(ax, x + w / 2, y + h - 2.5, title, fs=fs_t, color='white', bg=None, weight='bold')
        for i, f in enumerate(fields):
            ax.text(x + 1.6, y + h - 5.4 - i * spacing, f, fontsize=fs_f,
                    color='white', ha='left', va='center', zorder=5)
        return h

    # Row A (y=50) —— 用户 / 控件
    entity(3, 50, 30, 5, 'sp_sys_user　用户',
           ['id　PK', 'username　UNIQUE', 'password_hash', 'nickname / role', 'status'], '#722ed1')
    entity(67, 50, 30, 5, 'sp_component_def　控件',
           ['id　PK', 'code　UNIQUE', 'category / name', 'param_schema　JSON', 'impl_class'], '#8c8c8c')

    # Row B (y=29)
    entity(3, 29, 30, 6, 'sp_job　作业',
           ['id　PK', 'name / description', 'dag_json', 'version', 'parallelism', 'owner_id　FK → user'], '#2f54eb')
    entity(36, 29, 30, 6, 'sp_job_instance　实例',
           ['id　PK', 'job_id　FK → job', 'job_version', 'dag_snapshot', 'status / total_rows', 'started_at / stopped_at'], '#13c2c2')
    entity(67, 29, 30, 5, 'sp_job_metric　采样',
           ['id　PK', 'instance_id　FK', 'rows_per_sec', 'total_rows', 'sampled_at'], '#eb2f96')

    # Row C (y=6)
    entity(30, 6, 34, 7, 'sp_job_shard　分片',
           ['id　PK', 'instance_id　FK → instance', 'shard_index / shard_key', 'worker_id　FK → worker',
            'status / total_rows', 'progress（断点偏移）', 'fence_token（防双跑）'], '#13a8a8')
    entity(67, 6, 30, 6, 'sp_worker_node　Worker',
           ['id　PK', 'node_code　UNIQUE', 'address', 'status', 'last_heartbeat', 'registered_at'], '#fa8c16')

    arrow(ax, (18, 50), (18, 45.7), lw=1.3, style='-')
    label(ax, 22, 47.8, '1 : N', fs=7.6)
    arrow(ax, (33, 37), (36, 37), lw=1.3, style='-')
    label(ax, 34.5, 40.0, '1:N', fs=7.4)
    arrow(ax, (66, 37), (67, 37), lw=1.3, style='-')
    label(ax, 66.5, 40.0, '1:N', fs=7.4)
    arrow(ax, (51, 29), (51, 24.8), lw=1.3, style='-')
    label(ax, 55, 26.9, '1 : N', fs=7.6)
    arrow(ax, (64, 14), (67, 14), lw=1.3, style='-')
    label(ax, 65.5, 17.0, '1:N', fs=7.4)
    label(ax, 82, 47.8, '独立表：启动时由 SPI 扫描同步', fs=7.4, color=C_LINE, bg=None)
    label(ax, 50, 1.5, '唯一约束 uk_instance_shard(instance_id, shard_index)　·　索引 idx_worker_status(worker_id, status)'
                       '　·　idx_instance_time(instance_id, sampled_at)',
          fs=7.4, color=C_LINE, bg=None)
    save(fig, 'fig-05-ER图.png')


# ------------------------------------------------------------ 图 6 性能横扩
def fig_perf():
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.6))
    fig.patch.set_facecolor('white')
    # 数据来源：2026-10-04 T4 重跑批次（每格 1 次预热 + 3 次取中位数），权威口径见 docs/05 §4.2。
    # ※（U+203B）该格跨批次不稳定：另一批次以同配置（6 分片 / 1 Worker）测得 26.4s，与 4 分片持平。
    #   证据只支持「提升到 6 分片无额外收益」，不支持「6 分片更慢」，故单列并加注说明。
    #   注意：此处**不要**用 †(U+2020) —— Word 保存时会因字体缺字映射把它丢掉（实测 3 处全丢），
    #   脚注就失去了指代对象。U+203B 属中日韩标点区，中文字体必备。
    cfgs = ['1000万\np1 (1 Worker)', '1000万\np4 (1 Worker)', '1000万\np6 (3 Worker) ※', '5000万\np6 (3 Worker)']
    secs = [38.5, 16.2, 35.6, 50.8]
    tput = [26.0, 61.7, 28.1, 98.4]
    colors = ['#8c8c8c', C_CP, '#597ef7', C_OK]

    ax = axes[0]
    b = ax.bar(cfgs, secs, color=colors, width=0.58)
    ax.set_title('端到端耗时（秒，越低越好）', fontsize=11, color=C_TXT, pad=10)
    ax.set_ylabel('秒', fontsize=9.5)
    ax.grid(axis='y', ls=':', color='#d9d9d9')
    ax.set_axisbelow(True)
    ax.tick_params(labelsize=8.2)
    for r, v in zip(b, secs):
        ax.text(r.get_x() + r.get_width() / 2, v + 1.8, f'{v}', ha='center',
                fontsize=8.8, color=C_TXT, weight='bold')
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)

    ax = axes[1]
    b = ax.bar(cfgs, tput, color=colors, width=0.58)
    ax.set_title('吞吐（万行/秒，越高越好）', fontsize=11, color=C_TXT, pad=10)
    ax.set_ylabel('万行/秒', fontsize=9.5)
    ax.grid(axis='y', ls=':', color='#d9d9d9')
    ax.set_axisbelow(True)
    ax.tick_params(labelsize=8.2)
    ax.set_ylim(0, 130)
    for r, v in zip(b, tput):
        ax.text(r.get_x() + r.get_width() / 2, v + 2.4, f'{v}', ha='center',
                fontsize=8.8, color=C_TXT, weight='bold')
    # 箭头指向柱体右侧而非柱顶，避开柱顶的数值标签，防止压字
    ax.annotate('加速比 2.4×', xy=(1.30, 52), xytext=(0.42, 90), fontsize=9.4, color=C_WARN,
                weight='bold', arrowprops=dict(arrowstyle='->', color=C_WARN, lw=1.3))
    ax.annotate('加速比 3.3×', xy=(3.30, 86), xytext=(2.42, 114), fontsize=9.4, color=C_WARN,
                weight='bold', arrowprops=dict(arrowstyle='->', color=C_WARN, lw=1.3))
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)

    fig.suptitle('横向扩展实测（测试机 A：8 vCPU / 24GB / 300GB 虚拟磁盘　·　场景 csv→拼接→csv）',
                 fontsize=11.5, color=C_TXT, y=1.03)
    fig.text(0.5, -0.04,
             '※ 该格跨批次不稳定：另一批次同配置（6 分片 / 1 Worker）测得 26.4s，与 4 分片持平。'
             '证据只支持「提升到 6 分片无额外收益」，见《性能测试报告》§4.2。',
             ha='center', fontsize=7.6, color=C_LINE)
    fig.tight_layout()
    save(fig, 'fig-06-横向扩展.png')


# ------------------------------------------------------------ 图 7 部署拓扑
def fig_deploy():
    fig, ax, H = canvas(11, 6.4)

    rbox(ax, 1.5, 1.5, 97, H - 3, '', '#f0f5ff', z=0, ec='#adc6ff', radius=1.6)
    label(ax, 50, H - 5.5, 'Docker Compose 单机编排（docker compose up -d 一键启动）',
          fs=10.6, color=C_CP, weight='bold', bg=None)

    rbox(ax, 4, H - 20, 26, 11, 'frontend\nnode:20-alpine 构建 → nginx:alpine 托管\n:80　/ → SPA　/api → 控制面',
         C_FE, fs=7.9)
    rbox(ax, 34, H - 20, 28, 11, 'control-plane（prod profile）\nmaven:3.9-jdk21 构建 → temurin:21-jre\n:8080',
         C_CP, fs=7.9)
    rbox(ax, 66, H - 20, 30, 11, 'worker（无状态，可 --scale 扩容）\n同镜像 · 容器内 :8081 · -Xmx4g',
         C_DP, fs=7.9)

    rbox(ax, 4, H - 38, 28, 13, 'mysql:8.4\n:3306 · 首启自动建库建表（7 张 sp_ 前缀表）', '#d46b08', fs=8.0)
    rbox(ax, 36, H - 38, 28, 13, 'kafka:3.9.1（KRaft 单 broker）\n:9092 宿主 / :29092 容器间', '#531dab', fs=8.0)
    rbox(ax, 68, H - 38, 28, 13, 'redis:7-alpine\n:6379 · 补数控件数据源（可选心跳缓存）', '#c41d7f', fs=8.0)

    rbox(ax, 4, 4, 92, 8.5, '命名卷 / 绑定挂载：mysql-data（元数据持久化）　·　'
                            'data-exchange → 各容器 /data（文件类作业共享读写）　·　deploy/schema-mysql.sql → initdb 自动执行',
         '#f5f5f5', fs=8.1, tc=C_TXT, ec='#bfbfbf')

    # 控制流
    arrow(ax, (30, H - 14.5), (34, H - 14.5), lw=1.5, ms=12)
    label(ax, 32, H - 11.6, 'HTTP\n/api', fs=7.0)
    arrow(ax, (56, H - 20), (56, H - 25), lw=1.5, ms=12)
    label(ax, 61, H - 22.5, 'JDBC', fs=7.2)
    arrow(ax, (66, H - 22), (62, H - 24), lw=1.4, ms=12, ls='--')
    label(ax, 66, H - 25.5, '心跳 / 上报', fs=7.0)
    for x in (18, 50, 82):
        arrow(ax, (x, H - 38), (x, 13), lw=1.2, ls='--', color='#bfbfbf')
    save(fig, 'fig-07-部署拓扑.png')


# ------------------------------------------------------------ 图 8 示例作业 DAG
def fig_dag():
    fig, ax, H = canvas(10, 4.4)
    rbox(ax, 3, H * 0.40, 17, 11, 'csv-source\n/data/in.csv', C_SRC, fs=8.8)
    rbox(ax, 27, H * 0.40, 17, 11, 'field-concat\nc1 + c2 → ab', C_PROC, fs=8.8)
    rbox(ax, 55, H - 17, 18, 11, 'kafka-sink\ntopic=biz-demo', C_SINK, fs=8.8)
    rbox(ax, 55, 3, 18, 11, 'mysql-sink\ntable=demo_out', C_SINK, fs=8.8)
    arrow(ax, (20, H * 0.40 + 5.5), (27, H * 0.40 + 5.5), lw=2.2, ms=16)
    arrow(ax, (44, H * 0.40 + 9), (55, H - 12), lw=2.2, ms=16, rad=-0.15)
    arrow(ax, (44, H * 0.40 + 2), (55, 8.5), lw=2.2, ms=16, rad=0.15)
    label(ax, 50, H + 2.5, '扇出（fan-out）双写：同一份加工结果同时投递两个目标端',
          fs=9.8, color=C_TXT, weight='bold', bg=None)
    label(ax, 50, 0.0, '并行度 > 1 时：源按分片切片、汇输出 .partN 分文件；扇出两路各自计数校验一致',
          fs=8.2, color=C_LINE, bg=None)
    save(fig, 'fig-08-示例DAG.png')


# ------------------------------------------------- 图 9 竞品定位（象限图）
def fig_position():
    fig, ax = plt.subplots(figsize=(9.2, 6.0))
    fig.patch.set_facecolor('white')
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.set_xticks([])
    ax.set_yticks([])
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)
    ax.axvline(5, color='#d9d9d9', lw=1.2, ls='--', zorder=0)
    ax.axhline(5, color='#d9d9d9', lw=1.2, ls='--', zorder=0)
    ax.annotate('', xy=(9.9, 0.15), xytext=(0.1, 0.15),
                arrowprops=dict(arrowstyle='-|>', color=C_LINE, lw=1.4))
    ax.annotate('', xy=(0.15, 9.9), xytext=(0.15, 0.1),
                arrowprops=dict(arrowstyle='-|>', color=C_LINE, lw=1.4))
    ax.text(5.0, -0.30, '使用门槛（拖拽/零代码 → 需写代码 / 运维集群）', ha='center',
            fontsize=9.6, color=C_TXT)
    ax.text(-0.45, 5.0, '作业生命周期与编排管理能力', ha='center', va='center',
            rotation=90, fontsize=9.6, color=C_TXT)
    ax.text(2.5, 9.55, '本平台的目标空档', ha='center', fontsize=9.4,
            color=C_CP, weight='bold')
    ax.text(7.5, 9.55, '能力全面但重 / 贵', ha='center', fontsize=9.0, color='#8c8c8c')

    pts = [
        (8.6, 4.6, 'Apache Flink\nSpark Streaming', '#8c8c8c', 1200, 'below'),
        (7.0, 2.3, 'Kafka Streams', '#8c8c8c', 1050, 'below'),
        (5.0, 5.5, 'NiFi / Airbyte\n类集成工具', '#bfbfbf', 1250, 'below'),
        (6.6, 8.4, '商业数据中台\n（DataWorks 等）', '#d9d9d9', 1650, 'above'),
        (2.4, 2.0, 'DataX / 脚本 + 调度', '#bfbfbf', 1150, 'below'),
        (2.2, 8.5, '本项目', C_CP, 1900, 'right'),
    ]
    for x, y, t, c, s, place in pts:
        ax.scatter([x], [y], s=s, color=c, zorder=3, edgecolors='white', linewidths=1.4)
        if place == 'right':
            ax.text(x + 1.35, y, t, ha='left', va='center', fontsize=10.6,
                    color=C_CP, weight='bold', zorder=4)
        elif place == 'above':
            ax.text(x, y + 0.52, t, ha='center', va='bottom', fontsize=8.4,
                    color='#595959', zorder=4, linespacing=1.4)
        else:
            ax.text(x, y - 0.52, t, ha='center', va='top', fontsize=8.4,
                    color='#595959', zorder=4, linespacing=1.4)
    ax.set_title('同类方案定位：本平台切「低门槛 × 强作业管理」的空档',
                 fontsize=11.5, color=C_TXT, pad=12)
    fig.tight_layout()
    save(fig, 'fig-09-竞品定位.png')


# ------------------------------------------------- 图 10 成本对比
def fig_cost():
    fig, axes = plt.subplots(1, 2, figsize=(10.4, 4.2))
    fig.patch.set_facecolor('white')
    names = ['传统定制开发', '本平台（配置化）']
    colors = ['#8c8c8c', C_OK]

    ax = axes[0]
    b = ax.bar(names, [300, 20], color=colors, width=0.5)
    ax.set_title('年人力投入（人日 / 100 个需求）', fontsize=10.6, color=C_TXT, pad=10)
    ax.set_ylabel('人日', fontsize=9.2)
    ax.set_ylim(0, 350)
    ax.grid(axis='y', ls=':', color='#d9d9d9')
    ax.set_axisbelow(True)
    ax.tick_params(labelsize=9)
    for r, v in zip(b, [300, 20]):
        ax.text(r.get_x() + r.get_width() / 2, v + 8, str(v), ha='center',
                fontsize=10, color=C_TXT, weight='bold')
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)

    ax = axes[1]
    b = ax.bar(names, [36.0, 2.4], color=colors, width=0.5)
    ax.set_title('年人力成本（万元 / 100 个需求）', fontsize=10.6, color=C_TXT, pad=10)
    ax.set_ylabel('万元', fontsize=9.2)
    ax.set_ylim(0, 44)
    ax.grid(axis='y', ls=':', color='#d9d9d9')
    ax.set_axisbelow(True)
    ax.tick_params(labelsize=9)
    for r, v in zip(b, [36.0, 2.4]):
        ax.text(r.get_x() + r.get_width() / 2, v + 1.0, f'{v}', ha='center',
                fontsize=10, color=C_TXT, weight='bold')
    ax.annotate('约 -90%', xy=(1, 2.4), xytext=(0.52, 22), fontsize=11, color=C_WARN,
                weight='bold', arrowprops=dict(arrowstyle='->', color=C_WARN, lw=1.4))
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)

    fig.suptitle('降本测算（本团队估算：单需求传统模式 3 人日 → 平台模式 0.2 人日；1200 元/人日）',
                 fontsize=10.6, color=C_TXT, y=1.04)
    fig.tight_layout()
    save(fig, 'fig-10-成本对比.png')


def main():
    os.makedirs(OUT, exist_ok=True)
    print(f'输出目录: {OUT}')
    for fn in (fig_arch, fig_dfd, fig_pipeline, fig_state, fig_er, fig_perf,
               fig_deploy, fig_dag, fig_position, fig_cost):
        fn()
    print('完成。')

if __name__ == '__main__':
    main()
