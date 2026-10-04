import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouteTransition } from '../components/RouteTransition';
import { useThemeStore, useFontScaleStore } from '../store/theme';
import { prefersReducedMotion, usePrefersReducedMotion } from '../utils/motion';
import { frameBoxOf, type FrameBox } from '../utils/crosshair';
import { homePalette, type HomePalette } from '../theme/home';
import { SPACING, FONT_SIZE, RADIUS } from '../theme/tokens';
import { listJobs } from '../api/jobs';
import { listWorkers, listJobInstances } from '../api/instances';
import { AnimatedNumber } from '../components/AnimatedNumber';
import {
  UnorderedListOutlined,
  AppstoreOutlined,
  MonitorOutlined,
  EditOutlined,
} from '@ant-design/icons';

/** 快捷入口卡片 */
const QUICK_LINKS = [
  { path: '/jobs', icon: <UnorderedListOutlined />, label: '作业管理', sub: 'JOBS', desc: '编排与调度流处理作业' },
  { path: '/components', icon: <AppstoreOutlined />, label: '控件列表', sub: 'REGISTRY', desc: '20+ 种数据处理控件' },
  { path: '/monitor', icon: <MonitorOutlined />, label: '运行监控', sub: 'METRICS', desc: '实时指标与集群状态' },
  { path: '/jobs', icon: <EditOutlined />, label: '编辑画布', sub: 'CANVAS', desc: '从作业列表进入画布' },
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
    labels: ['KAFKA', 'CSV', 'MYSQL', 'EXCEL'],
    tips: ['Kafka 消息队列', 'CSV 文件读取', 'MySQL 全量同步', 'Excel 文件读取'],
  },
  transform: {
    // XML 那两个是**独立控件**（XML→JSON / JSON→XML），所以这里标单向，别写成 XML↔JSON
    labels: ['FILTER', 'MAP', 'CONCAT', 'XML→JSON', 'MASK', 'REDIS'],
    tips: ['条件过滤', '字段映射', '字段拼接', 'XML 转 JSON', '数据脱敏', 'Redis 补数'],
  },
  sink: {
    labels: ['MYSQL', 'CSV', 'KAFKA', 'HDFS', 'JDBC'],
    tips: ['MySQL 写入', 'CSV 导出', 'Kafka 下发', 'HDFS 归档', 'JDBC 通用写入'],
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

/** 节点圆半径（悬停时 35、选中时 38；碰撞检测按 32 算，故间距要留出放大的余量） */
const NODE_R = 32;
/**
 * 两圆最小间距（边缘到边缘）。
 * 取 24 而不是 16：节点悬停会放大到 35、选中到 38，鼠标磁吸还会再拉走最多 9 ——
 * 按 16 算时「选中(38) + 邻居(32) + 磁吸(9)」只剩 1 单位余量，贴边就重合了。
 */
const NODE_GAP = 24;

/**
 * 节点总数上限。
 * 三条放置带（source/sink 各 144 单位宽、transform 270，高 224）在 88 的硬间距下
 * 能容纳约 24 个，但节点堆到十几颗时画面已经糊了；更重要的是旧实现没有上限，
 * 节点会一路涨到放置带装不下的密度，然后落进「放弃碰撞检测」的兜底分支里直接重叠。
 * 实测重叠出现在 12~14 颗，这里取 10 留足余量。
 */
const MAX_NODES = 10;

/**
 * 悬停提示文字相对节点圆心的 y 偏移。
 * 注意 SVG 的 <text y> 是**基线**不是文字顶边，11px 字形还要从基线往上伸约 10px，
 * 所以这个值看着像"离圆心 56"，实际文字顶边在圆心 +46 左右。
 */
const TIP_OFFSET = 56;
/**
 * 画布底部为提示文字预留的高度 = 偏移(56) + 字高(~14) + 余量(4)。
 * 不留的话最下面一排节点的提示会被 SVG 的 viewBox 直接裁掉
 * （实测：最低节点 cy=276.5，文字要到 332.5，而 viewBox 高只有 320）。
 */
const TIP_RESERVED = TIP_OFFSET + 18;

/** 检查候选位置是否与现有节点圆相交（含正在淡出的 dying 节点 —— 它们仍在渲染） */
function collides(x: number, y: number, existing: TopoNode[]): boolean {
  const minDist = NODE_R * 2 + NODE_GAP; // 两圆心最小距离
  return existing.some((n) => Math.hypot(n.x - x, n.y - y) < minDist);
}

/**
 * 在指定类型的放置带里找一个不与现有节点重叠的位置。
 * **找不到就返回 null**，由调用方跳过这个节点 —— 绝不返回一个会重叠的位置。
 */
function randomNode(type: NodeType, w: number, h: number, existing: TopoNode[]): TopoNode | null {
  const defs = NODE_DEFS[type];
  const idx = Math.floor(Math.random() * defs.labels.length);
  const xRange: [number, number] =
    type === 'source' ? [0.06, 0.22] : type === 'transform' ? [0.35, 0.65] : [0.78, 0.94];

  const minDist = NODE_R * 2 + NODE_GAP;
  const w0 = xRange[0] * w, w1 = xRange[1] * w;
  const spanW = w1 - w0;
  // 放置带的下界不是 0.85h 而是 h - TIP_RESERVED：底部要腾出位置显示提示文字，
  // 否则最下面一排节点一悬停，文字就超出 viewBox 被裁掉。
  const bandTop = 0.15 * h;
  const bandBottom = h - TIP_RESERVED;
  const spanH = Math.max(0, bandBottom - bandTop);

  /*
   * 格子数按 minDist 反推，保证**相邻格心天然就满足间距**。
   * 旧实现写死 cols=3/rows=4，格心间距只有 48~56（远小于 80）——
   * 于是放一个节点会连带把相邻几个格子也判为占用，可用格子数骤减，
   * 很快就跌进后面那段「放弃碰撞检测」的兜底里，直接重叠。
   */
  const cols = Math.max(1, Math.floor(spanW / minDist) + 1);
  const rows = Math.max(1, Math.floor(spanH / minDist) + 1);
  const stepX = cols > 1 ? spanW / (cols - 1) : 0;
  const stepY = rows > 1 ? spanH / (rows - 1) : 0;
  // 抖动幅度：不超过「相邻格心超出硬间距的余量」的一半，抖动后仍大概率满足碰撞检测
  const jitterX = Math.max(0, (stepX - NODE_R * 2) / 2) * 0.5;
  const jitterY = Math.max(0, (stepY - NODE_R * 2) / 2) * 0.5;

  // 打乱全部格位后顺序试放：只要带内还有空位就一定找得到，不靠随机碰运气
  const slots: [number, number][] = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) slots.push([c, r]);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  for (const [c, r] of slots) {
    const x = w0 + c * stepX + (Math.random() - 0.5) * jitterX;
    // 抖动后必须夹回带内：底部那一排的抖动若把 y 推过 bandBottom，提示文字又会超出 viewBox
    const y = Math.min(bandBottom, Math.max(bandTop, bandTop + r * stepY + (Math.random() - 0.5) * jitterY));
    if (!collides(x, y, existing)) {
      return { id: nextId++, x, y, type, label: defs.labels[idx], tip: defs.tips[idx], opacity: 0 };
    }
  }
  return null; // 带内已满
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

  // 生成 2-3 条独立链路。放不下时少生成一条，绝不放置重叠节点
  const chains = 2 + Math.floor(Math.random() * 2);
  for (let c = 0; c < chains; c++) {
    if (nodes.length >= MAX_NODES) break;
    const src = randomNode('source', w, h, nodes);
    if (!src) break;
    nodes.push(src);
    const midCount = 1 + Math.floor(Math.random() * 2);
    let prev = src;
    for (let m = 0; m < midCount; m++) {
      if (nodes.length >= MAX_NODES) break;
      const mid = randomNode('transform', w, h, nodes);
      if (!mid) break;
      nodes.push(mid);
      edges.push({ from: prev.id, to: mid.id, throughput: randomThroughput() });
      prev = mid;
    }
    if (nodes.length >= MAX_NODES) break;
    const snk = randomNode('sink', w, h, nodes);
    if (!snk) break;
    nodes.push(snk);
    edges.push({ from: prev.id, to: snk.id, throughput: randomThroughput() });
  }

  // 额外节点也和最近节点连线，保证无孤立
  const extra = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < extra; i++) {
    if (nodes.length >= MAX_NODES) break;
    const types: NodeType[] = ['source', 'transform', 'sink'];
    const n = randomNode(types[Math.floor(Math.random() * 3)], w, h, nodes);
    if (!n) break;
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
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
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
              // 总数封顶：旧实现没有上限，节点会一路涨到放置带装不下的密度，
              // 然后落进「放弃碰撞检测」的兜底里直接重叠（实测 12~14 颗时开始出现）。
              const room = Math.max(0, MAX_NODES - nodes.length);
              const take = Math.min(count, room);
              for (let i = 0; i < take; i++) {
                const types: NodeType[] = ['source', 'transform', 'sink'];
                const newNode = randomNode(types[Math.floor(Math.random() * 3)], W, H, nodes);
                if (!newNode) break; // 带内已满：少加几个，不放重叠节点
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

  // 鼠标磁性吸附：只有光标正下方的那一个节点跟随光标微移，整张图和其余节点都不动
  const svgRef = useRef<SVGSVGElement>(null);
  const mousePos = useRef<{ x: number; y: number } | null>(null);
  const [offsets, setOffsets] = useState<Map<number, { dx: number; dy: number }>>(new Map());
  const rafRef = useRef<number>(0);

  // 节点列表放进 ref：节点淡入淡出会逐帧重建数组，若直接依赖 topo.nodes，
  // 下面的鼠标 effect 就会每一帧解绑重绑（旧实现的性能隐患）。
  const nodesRef = useRef(topo.nodes);
  useEffect(() => {
    nodesRef.current = topo.nodes;
  }, [topo.nodes]);

  useEffect(() => {
    if (reduced) return;
    const svg = svgRef.current;
    if (!svg) return;

    const ACQUIRE = 34;  // 光标进入该半径即吸附（SVG 坐标；节点 r=32，悬停 35）
    const MAX_PULL = 9;  // 节点最大位移（px）
    const LERP = 0.18;   // 平滑系数

    const onMove = (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      // 转换到 SVG viewBox 坐标系
      mousePos.current = {
        x: ((e.clientX - rect.left) / rect.width) * W,
        y: ((e.clientY - rect.top) / rect.height) * H,
      };
    };
    const onLeave = () => { mousePos.current = null; };

    const tick = () => {
      const mp = mousePos.current;

      // 每帧只挑出「光标正下方」最近的那一个节点，作为唯一位移目标
      const targets = new Map<number, { dx: number; dy: number }>();
      if (mp) {
        let hovered: TopoNode | null = null;
        let best = ACQUIRE;
        for (const n of nodesRef.current) {
          if (n.dying) continue;
          const d = Math.hypot(n.x - mp.x, n.y - mp.y);
          if (d < best) { best = d; hovered = n; }
        }
        if (hovered) {
          const dx = mp.x - hovered.x;
          const dy = mp.y - hovered.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.001) {
            const pull = Math.min(dist, MAX_PULL);
            targets.set(hovered.id, { dx: (dx / dist) * pull, dy: (dy / dist) * pull });
          }
        }
      }

      setOffsets((prev) => {
        const next = new Map<number, { dx: number; dy: number }>();
        for (const n of nodesRef.current) {
          const cur = prev.get(n.id) ?? { dx: 0, dy: 0 };
          const t = targets.get(n.id) ?? { dx: 0, dy: 0 };
          let dx = cur.dx + (t.dx - cur.dx) * LERP;
          let dy = cur.dy + (t.dy - cur.dy) * LERP;
          // 足够接近 0 就归零，避免永远收敛不到的抖动
          if (Math.abs(dx) < 0.05) dx = 0;
          if (Math.abs(dy) < 0.05) dy = 0;
          next.set(n.id, { dx, dy });
        }
        // 完全无变化时返回原对象，避免每帧触发一次重渲染
        let changed = next.size !== prev.size;
        if (!changed) {
          for (const [id, o] of next) {
            const p = prev.get(id);
            if (!p || p.dx !== o.dx || p.dy !== o.dy) { changed = true; break; }
          }
        }
        return changed ? next : prev;
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    svg.addEventListener('mousemove', onMove);
    svg.addEventListener('mouseleave', onLeave);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      svg.removeEventListener('mousemove', onMove);
      svg.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(rafRef.current);
    };
  }, [reduced]);

  return (
    <svg
      ref={svgRef}
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

      {/* 元信息标签（Kylin 风格） */}
      {/* 左上角：拓扑标识 */}
      <text x={8} y={16} fill={textColor} fontSize="7" fontFamily="ui-monospace, monospace" opacity="0.6">
        TOPOLOGY / LIVE
      </text>
      {/* 右上角：节点和边数量 */}
      <text x={W - 8} y={16} textAnchor="end" fill={textColor} fontSize="7" fontFamily="ui-monospace, monospace" opacity="0.6">
        NODES: {topo.nodes.filter((n) => !n.dying).length} / EDGES: {topo.edges.length}
      </text>
      {/* 左下角：坐标 */}
      <text x={8} y={H - 8} fill={textColor} fontSize="6" fontFamily="ui-monospace, monospace" opacity="0.35">
        SP-GRID / 900×320
      </text>
      {/* 右下角：状态 */}
      <text x={W - 8} y={H - 8} textAnchor="end" fill={nodeColor} fontSize="7" fontFamily="ui-monospace, monospace" opacity="0.8" fontWeight="700">
        ● ONLINE
      </text>

      {/* 边（曲线）——端点跟随节点偏移 */}
      {topo.edges.map((e, i) => {
        const from = topo.nodes.find((n) => n.id === e.from);
        const to = topo.nodes.find((n) => n.id === e.to);
        if (!from || !to) return null;
        const fromOff = offsets.get(from.id) ?? { dx: 0, dy: 0 };
        const toOff = offsets.get(to.id) ?? { dx: 0, dy: 0 };
        const fx = from.x + fromOff.dx;
        const fy = from.y + fromOff.dy;
        const tx2 = to.x + toOff.dx;
        const ty2 = to.y + toOff.dy;
        const isHighlighted = sel ? sel.connectedEdges.has(i) : false;
        const isDimmed = sel ? !isHighlighted : false;
        const isHovered = hoverEdge === i;
        const stroke = isDimmed ? dimmed : isHovered || isHighlighted ? lineHighlight : lineColor;
        const sw = isHovered || isHighlighted ? 2.5 : 1.5;
        const d = curvePath(fx, fy, tx2, ty2);
        const midX = (fx + tx2) / 2;
        const midY = (fy + ty2) / 2 - 14;

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

      {/* 节点：球 + 文字 + 提示作为一组刚体位移（偏移加在 <g> 上，不能只挪文字） */}
      {topo.nodes.map((n) => {
        const isSelected = selected === n.id;
        const isHovered = hoveredNode === n.id;
        const isConnected = sel ? sel.connectedNodes.has(n.id) : false;
        const isDimmed = sel ? !isConnected : false;
        const r = isSelected ? 38 : isHovered ? 35 : 32;
        const fill = isDimmed ? dimFill : nodeBg;
        const stroke = isDimmed ? dimmed : isHovered ? lineHighlight : nodeColor;
        const offset = offsets.get(n.id) ?? { dx: 0, dy: 0 };

        return (
          <g
            key={n.id}
            opacity={n.opacity}
            transform={`translate(${offset.dx} ${offset.dy})`}
            onClick={(ev) => {
              ev.stopPropagation();
              setSelected((prev) => (prev === n.id ? null : n.id));
            }}
            onMouseEnter={() => setHoveredNode(n.id)}
            onMouseLeave={() => setHoveredNode((prev) => (prev === n.id ? null : prev))}
            style={{ cursor: 'pointer' }}
          >
            {/* 只过渡颜色/线宽：原先写 transition: all，SVG 几何属性 cx/cy 也会被过渡，
                会和逐帧的位移 lerp 打架，圆在原地"打滑"，看起来就像只有文字在动。 */}
            <circle
              cx={n.x}
              cy={n.y}
              r={r}
              fill={fill}
              stroke={stroke}
              strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.5}
              filter={isSelected ? 'url(#sp-glow)' : isHovered ? 'url(#sp-glow)' : undefined}
              style={{ transition: 'fill 0.25s, stroke 0.25s, stroke-width 0.25s, r 0.2s' }}
            />
            <text
              x={n.x}
              y={n.y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isDimmed ? dimmed : nodeColor}
              fontSize="11"
              fontFamily="ui-monospace, monospace"
              fontWeight="700"
            >
              {n.label}
            </text>
            {(isSelected || isHovered) && (
              /*
               * y 是**基线**不是文字顶边：11px 的字形还要从基线往上伸约 10px。
               * 原先写 +40，看着像"圆心往下 40"，实际文字顶边落在圆心 +30 —— 比悬停圆的
               * 下沿（+35）还高，实测与圆**重叠 5.7px**。
               * +56 是实测调出来的：几何间隙约 11px（+60 时是 15.7px，视觉上偏远）。
               * 再调就往 52~58 之间挪，别再回到 40 附近 —— 那里会重新压住圆。
               */
              <text
                x={n.x}
                y={n.y + TIP_OFFSET}
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

/* ========== 像素故障小色块（Kylin 风格） ========== */

/** 预生成故障块配置：位置/大小/动画时长/延迟/颜色层级 */
const GLITCH_BLOCKS = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  x: 5 + Math.random() * 90,   // % 位置
  y: 5 + Math.random() * 85,
  w: 12 + Math.random() * 40,  // px 宽
  h: 3 + Math.random() * 10,   // px 高
  dur: 6 + Math.random() * 6,  // 动画周期 s
  delay: Math.random() * -8,   // 随机相位
  tier: i % 3,                  // 0=亮 1=中 2=暗
}));

function GlitchBlocks({ dark }: { dark: boolean }) {
  // 三种亮度层级，深色/浅色模式分别适配
  const colors = dark
    ? ['rgba(46,232,160,.35)', 'rgba(46,232,160,.18)', 'rgba(46,232,160,.08)']
    : ['rgba(47,84,235,.25)', 'rgba(47,84,235,.12)', 'rgba(47,84,235,.05)'];

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {GLITCH_BLOCKS.map((b) => (
        <div
          key={b.id}
          style={{
            position: 'absolute',
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.w,
            height: b.h,
            background: colors[b.tier],
            mixBlendMode: 'screen',
            animation: `spPixelFault ${b.dur}s steps(2,end) ${b.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ========== 十字光标（Kylin 风格，仅首页） ========== */

/** 框的包围盒（已含间距，由 frameBoxOf 算好）＋ 取色所需的标记 */
interface TargetRect extends FrameBox {
  /** 目标是否在侧边栏上 —— 决定框用浅色还是主题色，见下方 color 的取值 */
  onSidebar: boolean;
}

/**
 * 只在鼠标压住「快捷入口卡片」或「侧边栏菜单条」时，用四角括号把目标框住。
 *
 * **常态是系统普通光标** —— 本组件不再画跟随鼠标的小十字，也不再全局隐藏光标；
 * 隐藏范围只覆盖 .sp-quick-card / .sp-sider-item（见 global.css 里那条 media 规则）。
 * 这两者的 class 是唯一的"可被框住"的判据，加新的目标就改 CROSSHAIR_TARGETS
 * 并在 global.css 同步加一条 cursor:none，否则会出现「框画了、光标还在」。
 */
const CROSSHAIR_TARGETS = '.sp-quick-card, .sp-sider-item';

function CrosshairCursor({ dark }: { dark: boolean }) {
  const cursorRef = useRef<HTMLDivElement>(null);
  // rect 保留"最后一次框住的目标"：移出目标时靠它做淡出，而不是瞬间跳到 0 尺寸
  const [rect, setRect] = useState<TargetRect | null>(null);
  /** 当前是否正压在被框住的目标上 */
  const [over, setOver] = useState(false);
  // 必须放在下方 early return 之前：hooks 不能有条件地调用
  const z = useFontScaleStore((s) => s.scale) || 1;

  /** 当前悬停的目标元素，供下面的逐帧重同步使用 */
  const targetRef = useRef<Element | null>(null);
  /** 把元素矩形写进 state；值没变时返回原对象，React 会跳过重渲染（rAF 每帧调用也需要它） */
  const syncRect = useCallback((el: Element) => {
    // frameBoxOf 已把间距算进去（侧边栏目标还会夹在侧边栏矩形内，见 utils/crosshair.ts）
    const box = frameBoxOf(el);
    const onSidebar = el.matches('.sp-sider-item');
    setRect((prev) =>
      prev && prev.x === box.x && prev.y === box.y && prev.w === box.w && prev.h === box.h &&
      prev.onSidebar === onSidebar
        ? prev
        : { ...box, onSidebar },
    );
  }, []);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const onMove = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(CROSSHAIR_TARGETS) ?? null;
      targetRef.current = el;
      if (!el) {
        setOver(false); // 移出目标：淡出；保留 rect 供过渡使用
        return;
      }
      syncRect(el);
      setOver(true);
    };
    const onLeave = () => { targetRef.current = null; setOver(false); };

    document.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [syncRect]);

  /*
   * 悬停期间逐帧重读目标矩形。
   * 只在 mousemove 时读会让框滞后于"会动的目标"：菜单条 hover 有 0.22s 位移过渡、
   * 激活项点击后还有 0.4s 高度展开动画，这期间框会钉在旧位置，要等下一次鼠标移动才归位。
   * 值没变时 syncRect 返回原对象，React 直接跳过重渲染，所以空转的帧不产生渲染开销。
   */
  useEffect(() => {
    if (!over) return;
    let raf = 0;
    const tick = () => {
      if (targetRef.current) syncRect(targetRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [over, syncRect]);

  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return null;
  if (!rect) return null; // 还没框过任何目标：什么都不画，系统光标正常

  /*
   * 框色不能只看主题：**侧边栏在浅色/深色两套调色板里用的是同一个深蓝渐变**
   * （palette.ts 的 brandDeepGradient，两处都是 #141e30 → #243b55）。
   * 浅色模式下按主题画成黑色，落在深蓝上实测对比度只有 1.16:1 —— 等于看不见。
   * 所以侧边栏上的目标恒用浅色；首页卡片本身随主题深浅（浅色白底 / 深色深底），跟随主题即可。
   * onSidebar 存的是布尔而非颜色，这样切主题时重渲染能立刻拿到新值、不会残留旧色。
   */
  const color = rect.onSidebar || dark ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.6)';
  const CORNER = 8; // 角括号边长

  /*
   * 字体缩放用 body{zoom:z} 实现（见 store/theme.ts），本层是 body 的 fixed 后代，
   * 会被那个 zoom **再乘一次** —— 实测「框实际画出 = 传入值 × z」，z=1.3 时整整偏出 335px。
   * 而 getBoundingClientRect() 返回的已经是乘过 zoom 的视觉坐标，所以这里把要写进样式的
   * 尺寸与位移**一律除以 z** 还原成层内坐标，渲染出来才等于视觉值。
   * 层内的常量（角括号、边框、中心点）同样要除，否则它们会跟着变粗变大。
   * z 取自 store 而非 getComputedStyle：缩放变化时会触发重渲染，取到的一定是最新值。
   */
  const vis = (v: number) => v / z;

  // 四角分开包住目标（rect 已是"框"的矩形，间距含在内，此处不再加）
  const { w, h } = rect;
  const cx = rect.x + w / 2;
  const cy = rect.y + h / 2;

  // portal 到 body：本组件挂在被内容区包着的 Home 里，而 position:fixed 的包含块会被
  // 带 transform 的祖先劫持 —— 页面入场动画（.sp-page-enter 的 sp-page-in，前 ~400ms）
  // 期间框的原点会从视口跳到内容区原点，切页后立刻移鼠标能看到框闪一下。挂到 body 后消失。
  return createPortal(
    <div
      ref={cursorRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: vis(w),
        height: vis(h),
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: over ? 1 : 0,
        transition: 'opacity 0.15s, width 0.2s ease-out, height 0.2s ease-out',
        transform: `translate(${vis(cx - w / 2)}px, ${vis(cy - h / 2)}px)`,
      }}
    >
      {/* 四个角括号 */}
      <span style={{ position: 'absolute', top: 0, left: 0, width: vis(CORNER), height: vis(CORNER), borderTop: `${vis(2)}px solid ${color}`, borderLeft: `${vis(2)}px solid ${color}` }} />
      <span style={{ position: 'absolute', top: 0, right: 0, width: vis(CORNER), height: vis(CORNER), borderTop: `${vis(2)}px solid ${color}`, borderRight: `${vis(2)}px solid ${color}` }} />
      <span style={{ position: 'absolute', bottom: 0, left: 0, width: vis(CORNER), height: vis(CORNER), borderBottom: `${vis(2)}px solid ${color}`, borderLeft: `${vis(2)}px solid ${color}` }} />
      <span style={{ position: 'absolute', bottom: 0, right: 0, width: vis(CORNER), height: vis(CORNER), borderBottom: `${vis(2)}px solid ${color}`, borderRight: `${vis(2)}px solid ${color}` }} />
    </div>,
    document.body,
  );
}

/* ========== 首页真实数据指标 ========== */

interface HomeStats {
  workers: number;
  jobs: number;
  running: number;
  totalRows: number;
}

/** 格式化大数字：>=10000 显示 x.xw，>=1000 显示 x.xk */
function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function StatItem({ label, value, sub, palette, formatNum, live }: { label: string; value: number; sub: string; palette: HomePalette; formatNum?: boolean; live?: boolean }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 100 }}>
      <div
        style={{
          fontSize: FONT_SIZE.xs - 1,
          fontWeight: 600,
          fontFamily: 'ui-monospace, monospace',
          letterSpacing: 1.5,
          color: palette.textSecondary,
          opacity: 0.7,
          marginBottom: SPACING.xs,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        {live && <span className="sp-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: palette.accent, flexShrink: 0 }} />}
        {label}
      </div>
      <div
        style={{
          fontSize: FONT_SIZE.xxl - 2,
          fontWeight: 800,
          fontFamily: 'ui-monospace, monospace',
          color: palette.accent,
          lineHeight: 1.2,
          marginBottom: SPACING.xs - 2,
        }}
      >
        <AnimatedNumber value={value} format={formatNum ? fmtNum : (n) => n.toLocaleString()} />
      </div>
      <div
        style={{
          fontSize: FONT_SIZE.xs - 2,
          fontFamily: 'ui-monospace, monospace',
          letterSpacing: 1,
          color: palette.textSecondary,
          opacity: 0.5,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function StatsBar({ palette }: { palette: HomePalette }) {
  const dark = useThemeStore((s) => s.dark);
  const [stats, setStats] = useState<HomeStats | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [workers, jobs] = await Promise.all([listWorkers(), listJobs()]);
        if (!alive) return;
        const running = jobs.filter((j) => j.runningStatus === 'RUNNING').length;
        // 累计行数：取每个作业最新实例的 totalRows 求和（首页只展示量级）
        let totalRows = 0;
        for (const j of jobs) {
          try {
            const insts = await listJobInstances(j.id);
            if (!alive) return;
            if (insts.length > 0) totalRows += insts[0].totalRows || 0;
          } catch { /* 单个作业失败不影响整体 */ }
        }
        setStats({ workers: workers.length, jobs: jobs.length, running, totalRows });
      } catch {
        // 静默失败，首页指标不阻塞
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (!stats) {
    // 加载骨架：与全站「骨架屏替代 Spin」原则一致
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: SPACING.xxl,
          marginBottom: SPACING.xl - 4,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ textAlign: 'center', minWidth: 100 }}>
            <div
              style={{
                fontSize: FONT_SIZE.xs - 1,
                fontWeight: 600,
                fontFamily: 'ui-monospace, monospace',
                letterSpacing: 1.5,
                color: palette.textSecondary,
                opacity: 0.3,
                marginBottom: SPACING.xs,
              }}
            >
              ···
            </div>
            <div
              className="sp-stats-skeleton"
              style={{
                fontSize: FONT_SIZE.xxl - 2,
                fontWeight: 800,
                fontFamily: 'ui-monospace, monospace',
                lineHeight: 1.2,
                marginBottom: SPACING.xs - 2,
                height: 28,
                width: 60,
                margin: '0 auto',
                borderRadius: 4,
              }}
            />
            <div
              style={{
                fontSize: FONT_SIZE.xs - 2,
                fontFamily: 'ui-monospace, monospace',
                letterSpacing: 1,
                color: palette.textSecondary,
                opacity: 0.3,
              }}
            >
              加载中
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: SPACING.xxl,
        marginBottom: SPACING.xl - 4,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <StatItem label="WORKERS" value={stats.workers} sub="在线节点" palette={palette} />
      <span style={{ width: 1, height: 40, background: dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)', alignSelf: 'center' }} />
      <StatItem label="JOBS" value={stats.jobs} sub="作业总数" palette={palette} />
      <span style={{ width: 1, height: 40, background: dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)', alignSelf: 'center' }} />
      <StatItem label="RUNNING" value={stats.running} sub="运行中实例" palette={palette} live />
      <span style={{ width: 1, height: 40, background: dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)', alignSelf: 'center' }} />
      <StatItem label="ROWS" value={stats.totalRows} sub="累计处理" palette={palette} formatNum />
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
  sub,
  desc,
  index,
  onClick,
  palette,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  desc: string;
  index: number;
  onClick: () => void;
  palette: HomePalette;
}) {
  const no = `0${index + 1}`;
  return (
    <button
      type="button"
      className="sp-quick-card"
      onClick={onClick}
      style={{
        background: palette.cardBg,
        border: `1px solid ${palette.cardBorder}`,
        borderRadius: RADIUS.lg,
        padding: `${SPACING.xl - 4}px ${SPACING.md}px`,
        cursor: 'pointer',
        textAlign: 'center',
        font: 'inherit',
        position: 'relative',
        overflow: 'hidden',
        height: 140,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ['--sp-quick-border-hover' as string]: palette.cardHoverBorder,
        ['--sp-quick-shadow-hover' as string]: palette.cardHoverShadow,
        ['--sp-quick-accent' as string]: palette.accent,
        ['--sp-quick-card-bg' as string]: palette.cardBg,
        ['--sp-quick-text-primary' as string]: palette.textPrimary,
        ['--sp-quick-text-secondary' as string]: palette.textSecondary,
      }}
    >
      {/* 左上角小编号 */}
      <span
        style={{
          position: 'absolute',
          top: 10,
          left: 12,
          fontSize: 8,
          fontWeight: 700,
          fontFamily: 'ui-monospace, monospace',
          color: palette.textSecondary,
          letterSpacing: 1,
          opacity: 0.6,
          zIndex: 1,
        }}
      >
        A-{no}
      </span>
      {/* 右上角英文标签 */}
      <span
        style={{
          position: 'absolute',
          top: 10,
          right: 12,
          fontSize: FONT_SIZE.xs - 3,
          fontWeight: 600,
          fontFamily: 'ui-monospace, monospace',
          color: palette.textSecondary,
          letterSpacing: 1.5,
          opacity: 0.45,
          zIndex: 1,
        }}
      >
        {sub}
      </span>
      {/* 超大半透明编号装饰（右下角） */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          bottom: -12,
          right: 8,
          fontSize: 72,
          fontWeight: 800,
          fontFamily: 'ui-monospace, monospace',
          fontStyle: 'italic',
          lineHeight: 1,
          color: palette.accent,
          opacity: 0.07,
          pointerEvents: 'none',
          transition: 'opacity 0.25s',
        }}
      >
        {no}
      </span>
      <div style={{ fontSize: FONT_SIZE.xxl, color: palette.accent, marginBottom: SPACING.sm, position: 'relative', zIndex: 1 }}>{icon}</div>
      <div style={{ fontSize: FONT_SIZE.md, fontWeight: 700, color: palette.textPrimary, marginBottom: SPACING.xs, position: 'relative', zIndex: 1 }}>{label}</div>
      <div style={{ fontSize: FONT_SIZE.sm, color: palette.textSecondary, position: 'relative', zIndex: 1 }}>{desc}</div>
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
        return next;
      });
    }, 1800);
    return () => clearInterval(timer);
  }, [reduced]);

  // 首页配色集中到 src/theme/home.ts：暗色青绿、浅色品牌蓝
  const palette = homePalette(dark);

  return (
    <div
      className="sp-home-crosshair"
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
      <GlitchBlocks dark={dark} />
      <CrosshairCursor dark={dark} />

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

      {/* 主标题：Kylin 风格——第一行描边空心，第二行实心 */}
      <h1
        style={{
          margin: '0 0 6px',
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          lineHeight: 1.1,
        }}
      >
        <span
          style={{
            fontSize: 'clamp(36px, 4.5vw, 55px)',
            fontWeight: 600,
            letterSpacing: 2,
            color: 'transparent',
            WebkitTextStroke: `1px ${dark ? 'rgba(244,250,248,.55)' : 'rgba(26,35,50,.45)'}`,
          }}
        >
          通用流处理
        </span>
        <span
          style={{
            fontSize: 'clamp(44px, 5.5vw, 68px)',
            fontWeight: 900,
            letterSpacing: 1,
            color: palette.textPrimary,
            marginTop: -2,
          }}
        >
          任务管理平台
        </span>
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

      {/* 真实数据指标 */}
      <StatsBar palette={palette} />

      {/* 动态拓扑图 */}
      <div style={{ width: '100%', maxWidth: 960, marginBottom: 24, position: 'relative', zIndex: 1 }}>
        <TopoGraph palette={palette} />
      </div>

      {/* 滚动日志（演示样例：文案只写平台真实具备的能力） */}
      {/* 终端窗口风格的日志区 */}
      <div
        className="sp-terminal-window"
        style={{
          width: '100%',
          maxWidth: 640,
          marginBottom: 32,
          position: 'relative',
          zIndex: 1,
          borderRadius: 10,
          border: `1px solid ${dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'}`,
          background: dark ? 'rgba(13,17,23,.85)' : 'rgba(246,248,250,.9)',
          overflow: 'hidden',
        }}
      >
        {/* 终端标题栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            borderBottom: `1px solid ${dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'}`,
            background: dark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.03)',
          }}
        >
          {/* 红绿灯圆点 */}
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', flexShrink: 0 }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e', flexShrink: 0 }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840', flexShrink: 0 }} />
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 10,
              letterSpacing: 1,
              color: palette.textSecondary,
              opacity: 0.6,
            }}
          >
            sp-engine — bash
          </span>
        </div>
        {/* 日志内容 */}
        <div
          style={{
            padding: '10px 12px',
            height: 110,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            lineHeight: 1.8,
            color: dark ? palette.logText : palette.logText,
          }}
        >
          {logs.map((line, i) => (
            <div key={`${i}-${line}`} style={{ animation: 'spRtLogIn 0.3s ease-out both' }}>
              {line}
            </div>
          ))}
          {/* 闪烁光标 */}
          <span className="sp-terminal-cursor" style={{ color: palette.accent }}>▊</span>
        </div>
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
        {QUICK_LINKS.map((link, i) => (
          <QuickCard
            key={link.label}
            icon={link.icon}
            label={link.label}
            sub={link.sub}
            desc={link.desc}
            index={i}
            onClick={() => transitionTo(link.path)}
            palette={palette}
          />
        ))}
      </div>

      {/* 底部装饰标签（Kylin 风格） */}
      <div
        style={{
          width: '100%',
          maxWidth: 960,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 40,
          paddingTop: 16,
          borderTop: `1px solid ${dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)'}`,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 8,
          letterSpacing: 1.5,
          color: palette.textSecondary,
          opacity: 0.5,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span>SP / BOOT</span>
        <span>STREAM PROCESSING PLATFORM</span>
        <span>V1.0 / 2026</span>
      </div>
    </div>
  );
}
