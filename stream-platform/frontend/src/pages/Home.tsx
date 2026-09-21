import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouteTransition } from '../components/RouteTransition';
import { useThemeStore } from '../store/theme';
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
  { path: '/jobs', icon: <EditOutlined />, label: '编辑画布', desc: '可视化 DAG 编排' },
];

/** 模拟日志行 */
const LOG_POOL = [
  '> [source] Kafka 消费 5,000 行... OK',
  '> [transform] 数据清洗完成，过滤 12 条异常',
  '> [transform] 字段映射 id→user_id, ts→event_time',
  '> [sink] 写入 ClickHouse 5,000 行... OK',
  '> [source] CSV 读取批次 #47... OK',
  '> [transform] 聚合窗口 10s，触发计算',
  '> [sink] MySQL 批量插入 3,200 行... OK',
  '> [source] 断点续传偏移量 1,250,000',
  '> [transform] JOIN 维表命中率 98.7%',
  '> [sink] 扇出双写一致性校验通过',
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

function randomNode(type: NodeType, w: number, h: number, existing: TopoNode[]): TopoNode {
  const defs = NODE_DEFS[type];
  const idx = Math.floor(Math.random() * defs.labels.length);
  const xRange: [number, number] =
    type === 'source' ? [0.06, 0.22] : type === 'transform' ? [0.35, 0.65] : [0.78, 0.94];
  let x = 0, y = 0, tries = 0;
  do {
    x = (xRange[0] + Math.random() * (xRange[1] - xRange[0])) * w;
    y = (0.15 + Math.random() * 0.7) * h;
    tries++;
  } while (tries < 30 && existing.some((n) => Math.hypot(n.x - x, n.y - y) < 90));

  return { id: nextId++, x, y, type, label: defs.labels[idx], tip: defs.tips[idx], opacity: 0 };
}

function randomThroughput(): string {
  return THROUGHPUTS[Math.floor(Math.random() * THROUGHPUTS.length)];
}

function generateTopology(w: number, h: number): { nodes: TopoNode[]; edges: TopoEdge[] } {
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

  return { nodes, edges };
}

/** 贝塞尔曲线路径 */
function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const cy = Math.min(Math.abs(x2 - x1) * 0.25, 40);
  const dir = y2 > y1 ? -1 : 1;
  return `M ${x1} ${y1} C ${mx} ${y1 + cy * dir}, ${mx} ${y2 + cy * dir}, ${x2} ${y2}`;
}

/** 拓扑图组件 */
function TopoGraph({ dark }: { dark: boolean }) {
  const W = 900, H = 320;
  const [topo, setTopo] = useState(() => generateTopology(W, H));
  const [selected, setSelected] = useState<number | null>(null);
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const nodeColor = dark ? '#3ecfc0' : '#0d9b8a';
  const nodeBg = dark ? '#0f1e28' : '#d8efe9';
  const lineColor = dark ? 'rgba(62,207,192,.28)' : 'rgba(13,155,138,.22)';
  const lineHighlight = dark ? 'rgba(62,207,192,.85)' : 'rgba(13,155,138,.65)';
  const dotColor = dark ? '#5ee8d8' : '#1abfa8';
  const textColor = dark ? '#6ab8ac' : '#3a7a6e';
  const dimmed = dark ? 'rgba(62,207,192,.05)' : 'rgba(13,155,138,.03)';

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // 节点生灭循环：消失和生成交替，时间随机
  useEffect(() => {
    let alive = true;

    const schedulePhase = () => {
      if (!alive) return;
      // 随机间隔 2.5-5s
      const delay = 2500 + Math.random() * 2500;
      timersRef.current.push(
        setTimeout(() => {
          if (!alive) return;
          // 随机决定是消失还是生成（保证交替：上次消失则这次生成）
          const isRemove = Math.random() < 0.5;

          if (isRemove) {
            // 消失：正态分布 N(2, 0.5)，裁剪 [1, 3]
            const count = normalRandom(2, 0.5, 1, 3);
            setTopo((prev) => {
              const aliveNodes = prev.nodes.filter((n) => !n.dying);
              if (aliveNodes.length <= 4) return prev;
              const victims = aliveNodes
                .sort(() => Math.random() - 0.5)
                .slice(0, Math.min(count, aliveNodes.length - 3));
              const victimIds = new Set(victims.map((v) => v.id));
              const nodes = prev.nodes.map((n) => (victimIds.has(n.id) ? { ...n, dying: true } : n));
              const edges = prev.edges.filter((e) => !victimIds.has(e.from) && !victimIds.has(e.to));
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
            // 生成：正态分布 N(2, 0.5)，裁剪 [1, 3]
            const count = normalRandom(2, 0.5, 1, 3);
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
  }, []);

  // 节点淡入淡出动画帧
  useEffect(() => {
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
            opacity: n.dying ? Math.max(0, n.opacity - 0.025) : Math.min(1, n.opacity + 0.015),
          })),
        };
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

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
        const fill = isDimmed ? (dark ? '#111822' : '#f0f1f5') : nodeBg;
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

function Particles({ dark }: { dark: boolean }) {
  const color = dark ? 'rgba(62,207,192,.1)' : 'rgba(13,155,138,.07)';
  const particles = useRef(
    Array.from({ length: 25 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 4,
      dur: 15 + Math.random() * 20,
      delay: Math.random() * -20,
    })),
  );

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {particles.current.map((p) => (
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

export default function Home() {
  const { transitionTo } = useRouteTransition();
  const dark = useThemeStore((s) => s.dark);
  const [logs, setLogs] = useState<string[]>([]);
  const logIdx = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setLogs((prev) => {
        const next = [...prev, LOG_POOL[logIdx.current % LOG_POOL.length]];
        logIdx.current += 1;
        return next.slice(-6);
      });
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  const bgColor = dark ? '#050a10' : '#dde3ec';
  const cardBg = dark ? '#0d1822' : '#fff';
  const cardBorder = dark ? 'rgba(62,207,192,.22)' : 'rgba(13,155,138,.14)';
  const cardHoverBorder = dark ? 'rgba(62,207,192,.55)' : 'rgba(13,155,138,.45)';
  const textPrimary = dark ? '#f4faf8' : '#1a2332';
  const textSecondary = dark ? '#6ab8ac' : '#3a7a6e';
  const accentColor = dark ? '#3ecfc0' : '#0d9b8a';
  const glowBg = dark
    ? 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(62,207,192,.08), transparent)'
    : 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(13,155,138,.05), transparent)';

  return (
    <div
      style={{
        minHeight: '100%',
        background: bgColor,
        backgroundImage: glowBg,
        padding: '40px 40px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      <Particles dark={dark} />

      {/* 顶部标签 */}
      <div
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 2,
          color: textSecondary,
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
          color: textPrimary,
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
          color: textSecondary,
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
        <TopoGraph dark={dark} />
      </div>

      {/* 滚动日志 */}
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          minHeight: 110,
          marginBottom: 32,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          lineHeight: 1.8,
          color: accentColor,
          opacity: 0.75,
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
          <div
            key={link.label}
            onClick={() => transitionTo(link.path)}
            style={{
              background: cardBg,
              border: `1px solid ${cardBorder}`,
              borderRadius: 10,
              padding: '20px 16px',
              cursor: 'pointer',
              transition: 'all 0.25s',
              textAlign: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.borderColor = cardHoverBorder;
              e.currentTarget.style.boxShadow = dark
                ? '0 4px 20px rgba(62,207,192,.15)'
                : '0 4px 20px rgba(13,155,138,.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = cardBorder;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: 24, color: accentColor, marginBottom: 8 }}>{link.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>
              {link.label}
            </div>
            <div style={{ fontSize: 11, color: textSecondary }}>{link.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
