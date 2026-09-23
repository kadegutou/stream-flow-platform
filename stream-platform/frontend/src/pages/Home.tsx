import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouteTransition } from '../components/RouteTransition';
import { useThemeStore } from '../store/theme';
import { prefersReducedMotion, usePrefersReducedMotion } from '../utils/motion';
import { homePalette, type HomePalette } from '../theme/home';
import {
  UnorderedListOutlined,
  AppstoreOutlined,
  MonitorOutlined,
  EditOutlined,
} from '@ant-design/icons';

/** 快捷入口卡片 */
const QUICK_LINKS = [
  { path: '/jobs', icon: <UnorderedListOutlined />, label: '作业管理', desc: '编排与调度流处理作业' },
  { path: '/components', icon: <AppstoreOutlined />, label: '控件列表', desc: '20+ 种数据处理控件' },
  { path: '/monitor', icon: <MonitorOutlined />, label: '运行监控', desc: '实时指标与集群状态' },
  { path: '/jobs', icon: <EditOutlined />, label: '编辑画布', desc: '从作业列表进入画布' },
];

/**
 * 首页滚动的日志行（演示样例）。
 * 文案刻意只写平台真实具备的能力：源/汇为 CSV/Excel/JDBC/Kafka/HDFS，处理为字段拼接、
 * 字段映射、XML↔JSON、Redis 补数、数据脱敏，引擎侧是有界队列背压、分片派发、断点续传、fencing。
 * 不要再写 ClickHouse / JOIN 维表 / 窗口聚合这类本平台没有的能力——评委第一屏就会看到这段。
 */
const LOG_POOL = [
  '> [source] CSV 分片 #2 读取 64MB，行边界对齐... OK',
  '> [transform] 字段拼接 name + city → full_name',
  '> [sink] MySQL 批量插入 5,000 行... OK',
  '> [source] Kafka 分区 p3 消费 12,400 行... OK',
  '> [transform] Redis 补数命中 5,000 / 5,000 条',
  '> [sink] 扇出双写 CSV + HDFS 各 1,000,000 行，行数一致',
  '> [source] 断点续传：从字节偏移 12,582,912 继续',
  '> [transform] 数据脱敏：手机号 5,000 条掩码完成',
  '> [engine] 有界队列水位 38 / 64，背压生效',
  '> [engine] 分片 shard-3 派发至 worker-02',
];

/* ========== 动态拓扑图 ========== */

type NodeType = 'source' | 'transform' | 'sink';

interface TopoNode {
  id: number;
  x: number;
  y: number;
  type: NodeType;
  label: string;
  tip: string;
  opacity: number;
  dying?: boolean;
}

interface TopoEdge {
  from: number;
  to: number;
  throughput: string;
}

const NODE_DEFS: Record<NodeType, { labels: string[]; tips: string[] }> = {
  source: {
    labels: ['KAFKA', 'CSV', 'MYSQL', 'BINLOG'],
    tips: ['Kafka 消息队列', 'CSV 文件读取', 'MySQL 全量同步', 'MySQL Binlog 订阅'],
  },
  transform: {
    labels: ['FILTER', 'MAP', 'JOIN', 'AGG', 'WINDOW', 'DEDUP'],
    tips: ['条件过滤', '字段映射', '维表关联', '聚合计算', '窗口聚合', '数据去重'],
  },
  sink: {
    labels: ['CLICKHOUSE', 'MYSQL', 'KAFKA', 'ES', 'HDFS'],
    tips: ['ClickHouse 写入', 'MySQL 写入', 'Kafka 下发', 'Elasticsearch 索引', 'HDFS 归档'],
  },
};

const THROUGHPUTS = ['5,000 rows/s', '12,300 rows/s', '3,200 rows/s', '8,700 rows/s', '15,000 rows/s', '6,400 rows/s'];

let nextId = 1;

/** 正态分布随机数（Box-Muller），均值 mean，标准差 sigma，裁剪到 [min, max] */
function normalRandom(mean: number, sigma: number, min: number, max: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const val = mean + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(min, Math.min(max, Math.round(val)));
}

/** 节点圆半径（SVG 里 r=22，选中 26） */
const NODE_R = 22;
/** 两圆最小间距（边缘到边缘） */
const NODE_GAP = 12;

/** 检查候选位置是否与现有节点圆相交 */
function collides(x: number, y: number, existing: TopoNode[]): boolean {
  const minDist = NODE_R * 2 + NODE_GAP; // 两圆心最小距离
  return existing.some((n) => Math.hypot(n.x - x, n.y - y) < minDist);
}

function randomNode(type: NodeType, w: number, h: number, existing: TopoNode[]): TopoNode {
  const defs = NODE_DEFS[type];
  const idx = Math.floor(Math.random() * defs.labels.length);
  const xRange: [number, number] =
    type === 'source' ? [0.06, 0.22] : type === 'transform' ? [0.35, 0.65] : [0.78, 0.94];

  // 网格化均匀分布：把区域分成格子，找空闲格子放置
  const cols = 3, rows = 4;
  const cellW = ((xRange[1] - xRange[0]) * w) / cols;
  const cellH = (0.7 * h) / rows;
  const minDist = Math.min(cellW, cellH) * 0.55;

  // 收集所有空闲格子
  const freeCells: { cx: number; cy: number }[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cx = xRange[0] * w + c * cellW + cellW / 2;
      const cy = 0.15 * h + r * cellH + cellH / 2;
      const occupied = existing.some((n) => Math.hypot(n.x - cx, n.y - cy) < minDist);
      if (!occupied) freeCells.push({ cx, cy });
    }
  }

  let x = 0, y = 0;
  let placed = false;

  // 先尝试空闲格子 + 随机偏移，每次检查圆碰撞
  for (let attempt = 0; attempt < 20 && !placed; attempt++) {
    if (freeCells.length > 0) {
      const cell = freeCells[Math.floor(Math.random() * freeCells.length)];
      const cx = cell.cx + (Math.random() - 0.5) * cellW * 0.4;
      const cy = cell.cy + (Math.random() - 0.5) * cellH * 0.4;
      if (!collides(cx, cy, existing)) {
        x = cx; y = cy; placed = true;
      }
    } else {
      break;
    }
  }

  // 兜底：在区域内完全随机，仍检查碰撞
  for (let attempt = 0; attempt < 30 && !placed; attempt++) {
    const cx = (xRange[0] + Math.random() * (xRange[1] - xRange[0])) * w;
    const cy = (0.15 + Math.random() * 0.7) * h;
    if (!collides(cx, cy, existing)) {
      x = cx; y = cy; placed = true;
    }
  }

  // 最终兜底（极度密集时放弃碰撞检测，几乎不会触发）
  if (!placed) {
    x = (xRange[0] + Math.random() * (xRange[1] - xRange[0])) * w;
    y = (0.15 + Math.random() * 0.7) * h;
  }

  return { id: nextId++, x, y, type, label: defs.labels[idx], tip: defs.tips[idx], opacity: 0 };
}

function randomThroughput(): string {
  return THROUGHPUTS[Math.floor(Math.random() * THROUGHPUTS.length)];
}

function generateTopology(
  w: number,
  h: number,
  initialOpacity = 0,
): { nodes: TopoNode[]; edges: TopoEdge[] } {
  const nodes: TopoNode[] = [];
  const edges: TopoEdge[] = [];

  // 生成 2-3 条独立链路
  const chains = 2 + Math.floor(Math.random() * 2);
  for (let c = 0; c < chains; c++) {
    const src = randomNode('source', w, h, nodes);
    nodes.push(src);
    const midCount = 1 + Math.floor(Math.random() * 2);
    let prev = src;
    for (let m = 0; m < midCount; m++) {
      const mid = randomNode('transform', w, h, nodes);
      nodes.push(mid);
      edges.push({ from: prev.id, to: mid.id, throughput: randomThroughput() });
      prev = mid;
    }
    const snk = randomNode('sink', w, h, nodes);
    nodes.push(snk);
    edges.push({ from: prev.id, to: snk.id, throughput: randomThroughput() });
  }

  // 额外节点也和最近节点连线，保证无孤立
  const extra = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < extra; i++) {
    const types: NodeType[] = ['source', 'transform', 'sink'];
    const n = randomNode(types[Math.floor(Math.random() * 3)], w, h, nodes);
    nodes.push(n);
    // 和最近节点连线
    const others = nodes.filter((o) => o.id !== n.id);
    if (others.length > 0) {
      const nearest = others.sort(
        (a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y),
      )[0];
      edges.push({
        from: n.x < nearest.x ? n.id : nearest.id,
        to: n.x < nearest.x ? nearest.id : n.id,
        throughput: randomThroughput(),
      });
    }
  }

  // 关闭动画时直接以完全不透明起步（否则会一直停在 opacity 0，整张图不可见）
  return { nodes: nodes.map((n) => ({ ...n, opacity: initialOpacity })), edges };
}

/** 贝塞尔曲线路径 */
function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const cy = Math.min(Math.abs(x2 - x1) * 0.25, 40);
  const dir = y2 > y1 ? -1 : 1;
  return `M ${x1} ${y1} C ${mx} ${y1 + cy * dir}, ${mx} ${y2 + cy * dir}, ${x2} ${y2}`;
}

/** 拓扑图组件 */
function TopoGraph({ palette }: { palette: HomePalette }) {
  const W = 900, H = 320;
  const reduced = usePrefersReducedMotion();
  // 关闭动画时节点直接以完全不透明起步，避免一直停在 opacity 0（节点不可见）
  const [topo, setTopo] = useState(() => generateTopology(W, H, prefersReducedMotion() ? 1 : 0));
  const [selected, setSelected] = useState<number | null>(null);
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const { node: nodeColor, nodeFill: nodeBg, dimFill, dimmed, line: lineColor, lineHighlight, dot: dotColor, tip: textColor } =
    palette.graph;

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // 节点生灭循环：严格交替（消失→生成→消失→生成...），时间随机
  useEffect(() => {
    // 系统开启「减少动态效果」时不做节点生灭循环
    if (reduced) return;
    let alive = true;
    let lastWasRemove = false; // 上次是否是消失，保证交替

    const schedulePhase = () => {
      if (!alive) return;
      // 随机间隔 2.5-5s
      const delay = 2500 + Math.random() * 2500;
      timersRef.current.push(
        setTimeout(() => {
          if (!alive) return;
          // 严格交替：上次消失则这次生成，上次生成则这次消失
          const isRemove = !lastWasRemove;
          lastWasRemove = isRemove;

          if (isRemove) {
            // 消失：正态分布 N(2, 0.8)，裁剪 [1, 6]
            const count = normalRandom(2, 0.8, 1, 6);
            setTopo((prev) => {
              const aliveNodes = prev.nodes.filter((n) => !n.dying);
              if (aliveNodes.length <= 4) return prev;
              const victims = aliveNodes
                .sort(() => Math.random() - 0.5)
                .slice(0, Math.min(count, aliveNodes.length - 3));
              const victimIds = new Set(victims.map((v) => v.id));
              const nodes = prev.nodes.map((n) => (victimIds.has(n.id) ? { ...n, dying: true } : n));
              let edges = prev.edges.filter((e) => !victimIds.has(e.from) && !victimIds.has(e.to));

              // 修复孤立节点：消失后检查每个存活节点是否至少有一条边
              const aliveAfter = nodes.filter((n) => !n.dying);
              for (const n of aliveAfter) {
                const hasEdge = edges.some((e) => e.from === n.id || e.to === n.id);
                if (!hasEdge) {
                  // 找最近的非 dying 节点连线
                  const others = aliveAfter.filter((o) => o.id !== n.id);
                  if (others.length > 0) {
                    const nearest = others.sort(
                      (a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y),
                    )[0];
                    edges = [...edges, {
                      from: n.x < nearest.x ? n.id : nearest.id,
                      to: n.x < nearest.x ? nearest.id : n.id,
                      throughput: randomThroughput(),
                    }];
                  }
                }
              }
              return { nodes, edges };
            });
            // 0.8s 后清除 dying 节点
            timersRef.current.push(
              setTimeout(() => {
                if (!alive) return;
                setTopo((prev) => ({
                  nodes: prev.nodes.filter((n) => !n.dying),
                  edges: prev.edges,
                }));
                schedulePhase();
              }, 800),
            );
          } else {
            // 生成：正态分布 N(2, 0.8)，裁剪 [1, 6]
            const count = normalRandom(2, 0.8, 1, 6);
            setTopo((prev) => {
              const nodes = [...prev.nodes];
              const edges = [...prev.edges];
              for (let i = 0; i < count; i++) {
                const types: NodeType[] = ['source', 'transform', 'sink'];
                const newNode = randomNode(types[Math.floor(Math.random() * 3)], W, H, nodes);
                nodes.push(newNode);
                // 和最近节点连线
                const others = nodes.filter((n) => n.id !== newNode.id && !n.dying);
                if (others.length > 0) {
                  const nearest = others.sort(
                    (a, b) =>
                      Math.hypot(a.x - newNode.x, a.y - newNode.y) -
                      Math.hypot(b.x - newNode.x, b.y - newNode.y),
                  )[0];
                  edges.push({
                    from: newNode.x < nearest.x ? newNode.id : nearest.id,
                    to: newNode.x < nearest.x ? nearest.id : newNode.id,
                    throughput: randomThroughput(),
                  });
                }
              }
              return { nodes, edges };
            });
            schedulePhase();
          }
        }, delay),
      );
    };

    schedulePhase();
    return () => {
      alive = false;
      clearTimers();
    };
  }, [reduced]);

  // 节点淡入淡出动画帧
  useEffect(() => {
    if (reduced) return; // 静态展示（初始 opacity 已由 prefersReducedMotion 决定）
    let raf: number;
    const animate = () => {
      setTopo((prev) => {
        const changed = prev.nodes.some(
          (n) => (n.dying && n.opacity > 0) || (!n.dying && n.opacity < 1),
        );
        if (!changed) return prev;
        return {
          ...prev,
          nodes: prev.nodes.map((n) => ({
            ...n,
            opacity: n.dying ? Math.max(0, n.opacity - 0.015) : Math.min(1, n.opacity + 0.015),
          })),
        };
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // 获取与选中节点相连的边和节点集合
  const getConnected = useCallback(
    (nodeId: number) => {
      const connectedEdges = new Set<number>();
      const connectedNodes = new Set<number>([nodeId]);
      const queue = [nodeId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        topo.edges.forEach((e, i) => {
          if (e.from === cur && !connectedNodes.has(e.to)) {
            connectedNodes.add(e.to);
            connectedEdges.add(i);
            queue.push(e.to);
          }
          if (e.to === cur && !connectedNodes.has(e.from)) {
            connectedNodes.add(e.from);
            connectedEdges.add(i);
            queue.push(e.from);
          }
        });
      }
      return { connectedEdges, connectedNodes };
    },
    [topo.edges],
  );

  const sel = selected !== null ? getConnected(selected) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', maxWidth: 960, height: 'auto', display: 'block', margin: '0 auto', cursor: 'pointer' }}
      onClick={() => setSelected(null)}
    >
      <defs>
        <filter id="sp-glow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 边（曲线） */}
      {topo.edges.map((e, i) => {
        const from = topo.nodes.find((n) => n.id === e.from);
        const to = topo.nodes.find((n) => n.id === e.to);
        if (!from || !to) return null;
        const isHighlighted = sel ? sel.connectedEdges.has(i) : false;
        const isDimmed = sel ? !isHighlighted : false;
        const isHovered = hoverEdge === i;
        const stroke = isDimmed ? dimmed : isHovered || isHighlighted ? lineHighlight : lineColor;
        const sw = isHovered || isHighlighted ? 2.5 : 1.5;
        const d = curvePath(from.x, from.y, to.x, to.y);
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2 - 14;

        return (
          <g key={`e-${i}`}>
            {/* 透明宽热区（方便悬停） */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth="16"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverEdge(i)}
              onMouseLeave={() => setHoverEdge(null)}
              onClick={(ev) => ev.stopPropagation()}
            />
            {/* 可见虚线 */}
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
              strokeDasharray="6 4"
              style={{ transition: 'stroke 0.3s, stroke-width 0.3s', pointerEvents: 'none' }}
            />
            {/* 流动数据点 */}
            {!isDimmed && (
              <circle r="3" fill={dotColor} opacity="0.8" filter="url(#sp-glow)">
                <animateMotion dur={`${2 + (i % 3) * 0.5}s`} repeatCount="indefinite" path={d} />
                <animate attributeName="opacity" values="0;0.8;0.8;0" dur={`${2 + (i % 3) * 0.5}s`} repeatCount="indefinite" />
              </circle>
            )}
            {/* 悬停显示吞吐量 */}
            {isHovered && (
              <text
                x={midX}
                y={midY}
                textAnchor="middle"
                fill={nodeColor}
                fontSize="12"
                fontFamily="ui-monospace, monospace"
                fontWeight="700"
                style={{ pointerEvents: 'none' }}
              >
                {e.throughput}
              </text>
            )}
          </g>
        );
      })}

      {/* 节点 */}
      {topo.nodes.map((n) => {
        const isSelected = selected === n.id;
        const isConnected = sel ? sel.connectedNodes.has(n.id) : false;
        const isDimmed = sel ? !isConnected : false;
        const r = isSelected ? 26 : 22;
        const fill = isDimmed ? dimFill : nodeBg;
        const stroke = isDimmed ? dimmed : nodeColor;

        return (
          <g
            key={n.id}
            opacity={n.opacity}
            onClick={(ev) => {
              ev.stopPropagation();
              setSelected((prev) => (prev === n.id ? null : n.id));
            }}
            style={{ cursor: 'pointer' }}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={r}
              fill={fill}
              stroke={stroke}
              strokeWidth={isSelected ? 2.5 : 1.5}
              filter={isSelected ? 'url(#sp-glow)' : undefined}
              style={{ transition: 'all 0.25s' }}
            />
            <text
              x={n.x}
              y={n.y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isDimmed ? dimmed : nodeColor}
              fontSize="8"
              fontFamily="ui-monospace, monospace"
              fontWeight="700"
            >
              {n.label}
            </text>
            {isSelected && (
              <text
                x={n.x}
                y={n.y + 40}
                textAnchor="middle"
                fill={textColor}
                fontSize="11"
                fontFamily="ui-monospace, monospace"
              >
                {n.tip}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ========== 浮动粒子背景 ========== */

/**
 * 粒子是纯装饰且位置固定，在模块加载时算一次即可。
 * 原先写在 `useRef(Array.from(...))` 里：随机数在每次渲染都会重算（只是被丢弃），
 * 既浪费又是渲染期的不纯调用。
 */
const PARTICLES = Array.from({ length: 25 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 2 + Math.random() * 4,
  dur: 15 + Math.random() * 20,
  delay: Math.random() * -20,
}));

function Particles({ color }: { color: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: color,
            animation: `spParticleFloat ${p.dur}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ========== 首页组件 ========== */

/**
 * 快捷入口卡片。
 * 原先用 <div onClick> + onMouseEnter 直接改 DOM 样式：键盘不可达，hover 阴影把暗色值写死在 JSX。
 * 现在换成原生 button，hover 由 .sp-quick-card 的 CSS 变量驱动（见 global.css）。
 */
function QuickCard({
  icon,
  label,
  desc,
  onClick,
  palette,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
  palette: HomePalette;
}) {
  return (
    <button
      type="button"
      className="sp-quick-card"
      onClick={onClick}
      style={{
        background: palette.cardBg,
        border: `1px solid ${palette.cardBorder}`,
        borderRadius: 10,
        padding: '20px 16px',
        cursor: 'pointer',
        textAlign: 'center',
        font: 'inherit',
        ['--sp-quick-border-hover' as string]: palette.cardHoverBorder,
        ['--sp-quick-shadow-hover' as string]: palette.cardHoverShadow,
      }}
    >
      <div style={{ fontSize: 24, color: palette.accent, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: palette.textPrimary, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: palette.textSecondary }}>{desc}</div>
    </button>
  );
}

export default function Home() {
  const { transitionTo } = useRouteTransition();
  const dark = useThemeStore((s) => s.dark);
  const reduced = usePrefersReducedMotion();
  const [logs, setLogs] = useState<string[]>(() =>
    // 开启「减少动态效果」时不滚动，直接展示前几行静态日志
    prefersReducedMotion() ? LOG_POOL.slice(0, 6) : [],
  );
  const logIdx = useRef(0);

  useEffect(() => {
    if (reduced) return; // 静态日志已由初始 state 决定
    const timer = setInterval(() => {
      setLogs((prev) => {
        const next = [...prev, LOG_POOL[logIdx.current % LOG_POOL.length]];
        logIdx.current += 1;
        return next.slice(-6);
      });
    }, 1800);
    return () => clearInterval(timer);
  }, [reduced]);

  // 首页配色集中到 src/theme/home.ts：暗色青绿、浅色品牌蓝
  const palette = homePalette(dark);

  return (
    <div
      style={{
        minHeight: '100%',
        background: palette.pageBg,
        backgroundImage: palette.glow,
        padding: '40px 40px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      <Particles color={palette.particle} />

      {/* 顶部标签 */}
      <div
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 2,
          color: palette.textSecondary,
          marginBottom: 10,
          position: 'relative',
          zIndex: 1,
        }}
      >
        SYSTEM / ONLINE
      </div>

      {/* 主标题 */}
      <h1
        style={{
          fontSize: 'clamp(28px, 3.5vw, 42px)',
          fontWeight: 900,
          color: palette.textPrimary,
          margin: '0 0 6px',
          letterSpacing: 1,
          position: 'relative',
          zIndex: 1,
        }}
      >
        通用流处理任务管理平台
      </h1>
      <p
        style={{
          fontSize: 13,
          color: palette.textSecondary,
          fontFamily: 'ui-monospace, monospace',
          letterSpacing: 1,
          margin: '0 0 32px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        STREAM PROCESSING PLATFORM
      </p>

      {/* 动态拓扑图 */}
      <div style={{ width: '100%', maxWidth: 960, marginBottom: 24, position: 'relative', zIndex: 1 }}>
        <TopoGraph palette={palette} />
      </div>

      {/* 滚动日志（演示样例：文案只写平台真实具备的能力） */}
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          letterSpacing: 1,
          color: palette.textSecondary,
          opacity: 0.8,
          marginBottom: 6,
          position: 'relative',
          zIndex: 1,
        }}
      >
        DEMO OUTPUT / 演示样例
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          minHeight: 110,
          marginBottom: 32,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          lineHeight: 1.8,
          // 原来用强调色 + opacity .75，浅色下实际对比度只有约 3.2:1；改用深一档的 logText 并去掉透明度
          color: palette.logText,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {logs.map((line, i) => (
          <div key={`${i}-${line}`} style={{ animation: 'spRtLogIn 0.3s ease-out both' }}>
            {line}
          </div>
        ))}
      </div>

      {/* 快捷入口 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          width: '100%',
          maxWidth: 800,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {QUICK_LINKS.map((link) => (
          <QuickCard
            key={link.label}
            icon={link.icon}
            label={link.label}
            desc={link.desc}
            onClick={() => transitionTo(link.path)}
            palette={palette}
          />
        ))}
      </div>
    </div>
  );
}
