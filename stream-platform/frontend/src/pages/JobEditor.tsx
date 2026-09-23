import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Handle,
  Position,
  useReactFlow,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Drawer, Form, Space, Tour, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleFilled, DeleteOutlined, ExclamationCircleFilled, ExportOutlined, ImportOutlined, LayoutOutlined, NodeExpandOutlined, QuestionCircleOutlined, RedoOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { useRouteTransition } from '../components/RouteTransition';
import { useThemeStore } from '../store/theme';
import { listComponents } from '../api/components';
import { getJob, updateJob } from '../api/jobs';
import { showApiError } from '../api/request';
import { appMessage, appModal } from '../utils/antdApp';
import { EdgeCollapseButton, useEdgeHover } from '../components/EdgeCollapseButton';
import { usePrefersReducedMotion } from '../utils/motion';
import { FIXED, palette } from '../theme/palette';
import type { ComponentCategory, ComponentDef, Dag, Job } from '../types';
import { CATEGORY_LABEL, categoryBg, categoryColor } from '../theme/category';
import { ParamFormItems } from '../components/ParamFormItems';
import {
  isNodeConfigured,
  layeredLayout,
  validateDag,
  type ComponentFlowNode,
  type ComponentNodeData,
} from '../utils/dag';

/* ---------- 画布节点数据 ---------- */

const CATEGORY_ICON: Record<ComponentCategory, React.ReactNode> = {
  SOURCE: <ImportOutlined />,
  PROCESS: <NodeExpandOutlined />,
  SINK: <ExportOutlined />,
};

function ComponentNode(props: NodeProps<ComponentFlowNode>) {
  const dark = useThemeStore((s) => s.dark);
  const { data, selected } = props;
  const p = palette(dark);
  const color = categoryColor(data.category, dark);
  const bg = categoryBg(data.category, dark);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderRadius: 10,
        background: dark ? p.node : p.surface,
        minWidth: 176,
        overflow: 'hidden',
        border: `1px solid ${selected ? color : p.border}`,
        boxShadow: selected
          ? `0 0 0 3px ${color}33, 0 6px 16px rgba(0,0,0,.35)`
          : dark
            ? '0 2px 8px rgba(0,0,0,.4)'
            : '0 2px 8px rgba(31,45,61,.10)',
        transition: 'box-shadow .15s, border-color .15s',
      }}
    >
      <Handle type="target" position={Position.Left} />
      {/* 左侧色条 + 类别图标 */}
      <div
        style={{
          width: 40,
          background: bg,
          borderRight: `1px solid ${color}22`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          fontSize: 17,
        }}
      >
        {CATEGORY_ICON[data.category]}
      </div>
      <div style={{ padding: '8px 12px', flex: 1, position: 'relative' }}>
        {/* 参数配置状态角标：必填已配齐=绿勾，未配齐=橙叹号 */}
        <span
          title={isNodeConfigured(data) ? '参数已配置' : '有待填的必填参数'}
          style={{ position: 'absolute', top: 6, right: 8, fontSize: 12, lineHeight: 1 }}
        >
          {isNodeConfigured(data) ? (
            <CheckCircleFilled style={{ color: FIXED.okBadge }} />
          ) : (
            <ExclamationCircleFilled style={{ color: FIXED.warnBadge }} />
          )}
        </span>
        <div style={{ fontSize: 11, color, fontWeight: 700, letterSpacing: 0.4, lineHeight: 1.5 }}>
          {data.category} · {CATEGORY_LABEL[data.category]}
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, color: p.text, marginTop: 1 }}>{data.name}</div>
        {/* 控件编码：原 #a0a6b5/#5f6b84 分别只有 2.44:1 与 2.93:1，投影下基本看不清 */}
        <div style={{ fontSize: 11, color: p.textSubtle, fontFamily: 'monospace', lineHeight: 1.5 }}>
          {data.componentCode}
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { component: ComponentNode };

/** 连线样式：平滑贝塞尔 + 流动虚线动画 */
const FLOW_EDGE_STYLE = {
  type: 'smoothstep' as const,
  animated: true,
  // 描边色原为 #9aa4b8：白底上仅 2.51:1，投影后连线发虚；#78839a 提到 3.81:1
  style: { stroke: '#78839a', strokeWidth: 1.8 },
};

/** 碎裂动画的单个粒子参数 */
interface ShatterParticle {
  id: number;
  dx: string;
  dy: string;
  rot: number;
  size: number;
  dur: string;
}

/** 碎裂动画状态：起点、颜色 + 预生成的粒子参数 */
interface ShatterState {
  x: number;
  y: number;
  color: string;
  particles: ShatterParticle[];
}

/**
 * 生成一组碎裂粒子参数。
 * 只在「删除节点」的事件回调里调用：渲染期使用随机数会让渲染变成非纯函数
 * （重复渲染结果不同、截图不稳定）。
 */
function makeShatterParticles(): ShatterParticle[] {
  return Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.5;
    const spread = 40 + Math.random() * 80;
    return {
      id: i,
      dx: (Math.cos(angle) * spread).toFixed(0),
      dy: (220 + Math.random() * 260).toFixed(0), // 总体向下坠落出画布
      rot: Math.round((Math.random() - 0.5) * 720),
      size: 6 + Math.random() * 8,
      dur: (0.55 + Math.random() * 0.3).toFixed(2),
    };
  });
}

/* ---------- 画布主体 ---------- */

function FlowCanvas() {
  const { id } = useParams<{ id: string }>();
  const { transitionTo } = useRouteTransition();
  const { screenToFlowPosition } = useReactFlow();
  const dark = useThemeStore((s) => s.dark);
  const p = palette(dark);

  const [job, setJob] = useState<Job | null>(null);
  const [components, setComponents] = useState<ComponentDef[]>([]);
  const [nodes, setNodes] = useState<ComponentFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const { hover: panelHover, handlers: panelHoverHandlers } = useEdgeHover();
  const [draggingNode, setDraggingNode] = useState(false);
  const [trashActive, setTrashActive] = useState(false);
  const [shatter, setShatter] = useState<ShatterState | null>(null);
  const reduced = usePrefersReducedMotion();
  const [tourOpen, setTourOpen] = useState(false);
  const nodeSeq = useRef(1);
  const trashRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const [paramForm] = Form.useForm();

  // 首次进入画布：自动弹出四步引导（localStorage 记忆）
  useEffect(() => {
    if (localStorage.getItem('sp-editor-tour-done') !== '1') {
      const t = setTimeout(() => setTourOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);
  const closeTour = () => {
    setTourOpen(false);
    localStorage.setItem('sp-editor-tour-done', '1');
  };

  const componentMap = useMemo(() => {
    const map = new Map<string, ComponentDef>();
    components.forEach((c) => map.set(c.code, c));
    return map;
  }, [components]);

  // 加载控件与作业，DAG 反解析回画布
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [comps, jobData] = await Promise.all([listComponents(), getJob(Number(id))]);
        setComponents(comps);
        setJob(jobData);
        const cmap = new Map(comps.map((c) => [c.code, c]));
        const dag: Dag = jobData.dag ?? { nodes: [], edges: [] };
        let maxSeq = 0;
        const flowNodes: ComponentFlowNode[] = dag.nodes.map((n, i) => {
          const comp = cmap.get(n.componentCode);
          const seq = Number(n.id.replace(/^n/, ''));
          if (!Number.isNaN(seq)) maxSeq = Math.max(maxSeq, seq);
          return {
            id: n.id,
            type: 'component',
            position: { x: 60 + (i % 5) * 240, y: 60 + Math.floor(i / 5) * 130 },
            data: {
              componentCode: n.componentCode,
              name: comp?.name ?? n.componentCode,
              category: comp?.category ?? 'PROCESS',
              params: n.params ?? {},
              schema: comp?.paramSchema,
            },
          };
        });
        const flowEdges: Edge[] = dag.edges.map((e, i) => ({
          id: `e${i}-${e.from}-${e.to}`,
          source: e.from,
          target: e.to,
          ...FLOW_EDGE_STYLE,
        }));
        nodeSeq.current = maxSeq + 1;
        // 有内容时做一次分层布局，让加载出来的图更整齐
        setNodes(flowNodes.length > 0 ? layeredLayout(flowNodes, flowEdges) : flowNodes);
        setEdges(flowEdges);
        // 加载完成，此后画布变更才计入撤销历史（加载出的 DAG 即历史起点）
        loadedRef.current = true;
      } catch (e) {
        showApiError(e, '加载作业失败');
      }
    })();
  }, [id]);

  /* ---------- 撤销 / 重做 ---------- */

  /** 历史快照栈（nodes + edges）。防抖入栈，拖动/连线的中间态不记录 */
  const historyRef = useRef<{ nodes: ComponentFlowNode[]; edges: Edge[] }[]>([]);
  const historyIndexRef = useRef(-1);
  const loadedRef = useRef(false); // DAG 加载完成前不记历史，避免把空画布当成可撤销的初始态
  const [paramSyncTick, setParamSyncTick] = useState(0); // 撤销/重做后强制参数抽屉重新同步表单

  // 历史栈本体放 ref（避免每次入栈都重建回调），栈指针另存一份 state 供渲染使用：
  // 渲染期直接读 ref 不是合法用法（React 可能在没有 state 变化时重渲染），故这里显式同步。
  const [historyState, setHistoryState] = useState({ index: -1, size: 0 });
  const syncHistoryState = useCallback(() => {
    setHistoryState({ index: historyIndexRef.current, size: historyRef.current.length });
  }, []);
  const canUndo = historyState.index > 0;
  const canRedo = historyState.index < historyState.size - 1;

  /**
   * 生成历史快照。刻意剥掉 React Flow 注入的瞬态字段（selected / dragging / measured）：
   * 否则「点一下节点」这种纯选中变化也会被判定成一次编辑，Ctrl+Z 会先撤销选中而不是撤销编辑。
   */
  const snapshotOf = useCallback(
    (ns: ComponentFlowNode[], es: Edge[]) => ({
      nodes: ns.map((n) => ({
        ...n,
        selected: undefined,
        dragging: undefined,
        measured: undefined,
        position: { ...n.position },
        data: { ...n.data },
      })),
      edges: es.map((e) => ({ ...e, selected: undefined })),
    }),
    [],
  );

  // nodes/edges 稳定 500ms 后记一次快照；与当前指针快照相同则跳过（撤销/重做自身触发的变化）
  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      const snapshot = snapshotOf(nodes, edges);
      const stack = historyRef.current;
      const cur = stack[historyIndexRef.current];
      if (cur && JSON.stringify(cur) === JSON.stringify(snapshot)) return;
      stack.splice(historyIndexRef.current + 1); // 产生新分支时丢弃重做栈
      stack.push(snapshot);
      if (stack.length > 60) stack.shift(); // 上限 60 步，防内存增长
      historyIndexRef.current = stack.length - 1;
      syncHistoryState();
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes, edges, snapshotOf, syncHistoryState]);

  const applySnapshot = useCallback(
    (index: number) => {
      const snap = historyRef.current[index];
      if (!snap) return;
      historyIndexRef.current = index;
      setNodes(snap.nodes);
      setEdges(snap.edges);
      // 快照里没有 selected，撤销后保持「刚才在编辑的节点」仍选中，
      // 并让参数抽屉重新同步表单（否则抽屉里显示的还是撤销前的值）
      const stillExists = selectedNodeId != null && snap.nodes.some((n) => n.id === selectedNodeId);
      setSelectedNodeId(stillExists ? selectedNodeId : null);
      if (stillExists) setParamSyncTick((v) => v + 1);
      syncHistoryState();
    },
    [selectedNodeId, syncHistoryState],
  );

  const undo = useCallback(() => applySnapshot(historyIndexRef.current - 1), [applySnapshot]);
  const redo = useCallback(() => applySnapshot(historyIndexRef.current + 1), [applySnapshot]);

  // Ctrl/Cmd+Z 撤销，Ctrl+Shift+Z 或 Ctrl+Y 重做（输入框内不拦截，交给浏览器原生撤销）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ComponentFlowNode>[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (conn: Connection) =>
      setEdges((eds) =>
        addEdge(
          { ...conn, id: `e-${conn.source}-${conn.target}-${Date.now()}`, ...FLOW_EDGE_STYLE },
          eds,
        ),
      ),
    [],
  );

  // 拖入控件
  const onDragStart = (e: React.DragEvent, comp: ComponentDef) => {
    e.dataTransfer.setData('application/stream-component', comp.code);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const code = e.dataTransfer.getData('application/stream-component');
    const comp = componentMap.get(code);
    if (!comp) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newNode: ComponentFlowNode = {
      id: `n${nodeSeq.current++}`,
      type: 'component',
      position,
      data: {
        componentCode: comp.code,
        name: comp.name,
        category: comp.category,
        params: {},
        schema: comp.paramSchema,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  // 拖动画布节点时：检测是否悬停在垃圾桶上
  const onNodeDrag = useCallback((e: MouseEvent | TouchEvent) => {
    const rect = trashRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { clientX, clientY } = 'touches' in e ? e.touches[0] : e;
    setTrashActive(
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom,
    );
  }, []);

  // 节点拖入垃圾桶松手 → 播放碎裂动画后删除节点及其连线
  const onNodeDragStop = useCallback(
    (e: MouseEvent | TouchEvent, node: ComponentFlowNode) => {
      const rect = trashRef.current?.getBoundingClientRect();
      const { clientX, clientY } = 'touches' in e ? e.changedTouches[0] : e;
      const inTrash =
        rect &&
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      setDraggingNode(false);
      setTrashActive(false);
      if (!inTrash) return;

      // 立即从画布移除节点（碎裂动画在原位置播放）
      const wrapRect = canvasWrapRef.current?.getBoundingClientRect();
      const color = categoryColor(node.data.category, dark);
      setNodes((nds) => nds.filter((n) => n.id !== node.id));
      setEdges((eds) => eds.filter((ed) => ed.source !== node.id && ed.target !== node.id));
      setSelectedNodeId((sel) => (sel === node.id ? null : sel));
      // 减少动态效果时不做碎裂动画，直接删除
      if (wrapRect && !reduced) {
        // 动画起点上移一段，避免碎裂位置太靠下
        setShatter({
          x: clientX - wrapRect.left,
          y: clientY - wrapRect.top - 60,
          color,
          particles: makeShatterParticles(),
        });
        setTimeout(() => setShatter(null), 900);
      }
      appMessage().success(`已删除控件：${node.data.name}`);
    },
    [dark, reduced],
  );

  // 点击节点 → 打开参数抽屉
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  useEffect(() => {
    if (selectedNode) {
      // setFieldsValue 是 merge 语义：不清空会残留上一节点同名字段，污染当前节点参数
      paramForm.resetFields();
      paramForm.setFieldsValue(selectedNode.data.params);
    }
    // paramSyncTick：撤销/重做后强制重新灌一次表单值
  }, [selectedNodeId, paramSyncTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const onParamValuesChange = (_: unknown, allValues: Record<string, unknown>) => {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNodeId) return n;
        // 只写回当前控件 schema 声明的字段，防止残留字段随 DAG 保存
        const schemaKeys = new Set(Object.keys(n.data.schema?.properties ?? {}));
        const params = Object.fromEntries(Object.entries(allValues).filter(([k]) => schemaKeys.has(k)));
        return { ...n, data: { ...n.data, params } };
      }),
    );
  };

  // 保存 DAG
  const onSave = async () => {
    if (!job) return;
    const problems = validateDag(nodes, edges);
    if (problems.length > 0) {
      appModal().warning({
        title: '作业还不能保存',
        content: (
          <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
            {problems.map((p) => (
              <li key={p} style={{ marginBottom: 4 }}>{p}</li>
            ))}
          </ul>
        ),
        okText: '去修改',
      });
      return;
    }
    const dag: Dag = {
      nodes: nodes.map((n) => ({
        id: n.id,
        componentCode: n.data.componentCode,
        params: n.data.params,
      })),
      edges: edges.map((e) => ({ from: e.source, to: e.target })),
    };
    setSaving(true);
    try {
      const updated = await updateJob(job.id, {
        name: job.name,
        description: job.description,
        parallelism: job.parallelism,
        dag,
      });
      setJob(updated);
      appMessage().success(`已保存（版本 v${updated.version}）`);
    } catch (e) {
      showApiError(e, '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onAutoLayout = () => {
    setNodes((nds) => layeredLayout(nds, edges));
    appMessage().success('已自动布局');
  };

  const groupedComponents = useMemo(
    () =>
      (['SOURCE', 'PROCESS', 'SINK'] as ComponentCategory[]).map((cat) => ({
        category: cat,
        items: components.filter((c) => c.category === cat),
      })),
    [components],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(var(--sp-viewport-h) - 96px)' }}>
      {/* 顶部工具栏 */}
      <div
        style={{
          background: p.surface,
          padding: '8px 16px',
          marginBottom: 8,
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => transitionTo('/jobs')}>
            返回
          </Button>
          <Typography.Text strong>
            {job ? `${job.name}（v${job.version}）` : '作业画布'}
          </Typography.Text>
        </Space>
        <Space>
          <Button
            icon={<UndoOutlined />}
            onClick={undo}
            disabled={!canUndo}
            title="撤销（Ctrl+Z）"
          />
          <Button
            icon={<RedoOutlined />}
            onClick={redo}
            disabled={!canRedo}
            title="重做（Ctrl+Shift+Z / Ctrl+Y）"
          />
          <Button icon={<LayoutOutlined />} onClick={onAutoLayout}>
            自动布局
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave} ref={saveBtnRef}>
            保存
          </Button>
          <Button
            icon={<QuestionCircleOutlined />}
            title="操作引导"
            onClick={() => setTourOpen(true)}
          />
        </Space>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: 8, minHeight: 0 }}>
        {/* 左侧控件面板（可折叠；折叠后留触发条） */}
        <div
          ref={panelRef}
          {...panelHoverHandlers}
          style={{ position: 'relative', width: panelCollapsed ? 16 : 220, flexShrink: 0, transition: 'width .15s' }}
        >
          {!panelCollapsed && (
            <div
              style={{
                height: '100%',
                background: p.surface,
                borderRadius: 8,
                padding: 12,
                overflow: 'auto',
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                拖拽控件到画布
              </Typography.Text>
              {groupedComponents.map((group) => (
                <div key={group.category} style={{ marginTop: 12 }}>
                  <Typography.Text strong style={{ color: categoryColor(group.category, dark), fontSize: 12 }}>
                    {group.category} {CATEGORY_LABEL[group.category]}
                  </Typography.Text>
                  {group.items.map((comp) => (
                    <div
                      key={comp.code}
                      draggable
                      onDragStart={(e) => onDragStart(e, comp)}
                      title={comp.description}
                      style={{
                        border: `1px solid ${categoryColor(comp.category, dark)}`,
                        borderLeft: `4px solid ${categoryColor(comp.category, dark)}`,
                        borderRadius: 8,
                        padding: '6px 8px',
                        margin: '6px 0',
                        cursor: 'grab',
                        background: dark ? p.node : FIXED.paletteItemBg,
                        fontSize: 13,
                      }}
                    >
                      {comp.name}
                      <div style={{ fontSize: 12, color: p.textSubtle }}>{comp.code}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {panelCollapsed && (
            <div style={{ height: '100%', background: dark ? p.node : p.surfaceMuted, borderRadius: 8 }} />
          )}
          {/* 悬停面板区域时出现折叠/展开按钮：半透明、垂直居中、直边贴栏、外侧半圆 */}
          {panelHover && (
            <EdgeCollapseButton
              collapsed={panelCollapsed}
              onToggle={() => setPanelCollapsed(!panelCollapsed)}
              dark={dark}
              label={panelCollapsed ? '展开控件栏' : '收起控件栏'}
            />
          )}
        </div>

        {/* 画布 */}
        <div ref={canvasWrapRef} style={{ flex: 1, borderRadius: 8, overflow: 'hidden', background: p.canvas, position: 'relative' }}>
          {/* 碎裂动画关键帧（小方块坠落出画布底部） */}
          <style>{`
            @keyframes sp-shatter-fall {
              0%   { opacity: 1; transform: translate(0, 0) rotate(0deg); }
              100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); }
            }
          `}</style>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            onNodeDragStart={() => setDraggingNode(true)}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
            colorMode={dark ? 'dark' : 'light'}
          >
            <Background gap={16} color={p.canvasDot} />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const cat = (n.data as ComponentNodeData).category;
                return cat ? categoryColor(cat, dark) : '#78839a';
              }}
              maskColor={p.minimapMask}
              bgColor={p.surface}
              style={{ borderRadius: 8 }}
              pannable
              zoomable
            />
          </ReactFlow>
          {/* 垃圾桶：仅在拖动画布节点时浮现；节点悬停其上时放大变红 */}
          {draggingNode && (
            <div
              ref={trashRef}
              style={{
                position: 'absolute',
                bottom: 96,
                left: '50%',
                transform: `translateX(-50%) scale(${trashActive ? 1.3 : 1})`,
                width: 120,
                height: 64,
                borderRadius: 12,
                border: `2px dashed ${trashActive ? FIXED.trashDanger : '#bbb'}`,
                background: trashActive
                  ? dark
                    ? '#3a1f24'
                    : '#fff1f0'
                  : dark
                    ? 'rgba(27,35,52,.92)'
                    : 'rgba(255,255,255,.92)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: trashActive ? FIXED.trashDanger : p.textSubtle,
                fontSize: 12,
                zIndex: 10,
                pointerEvents: 'none',
                transition: 'transform .15s, border-color .15s, background .15s',
              }}
            >
              <DeleteOutlined style={{ fontSize: 22 }} />
              拖到此处删除
            </div>
          )}
          {/* 碎裂粒子：节点删除瞬间在其位置散开坠落 */}
          {shatter &&
            shatter.particles.map((p) => (
              <div
                key={p.id}
                style={{
                  position: 'absolute',
                  left: shatter.x - p.size / 2,
                  top: shatter.y - p.size / 2,
                  width: p.size,
                  height: p.size,
                  borderRadius: 2,
                  background: shatter.color,
                  opacity: 0.9,
                  zIndex: 30,
                  pointerEvents: 'none',
                  ['--dx' as string]: `${p.dx}px`,
                  ['--dy' as string]: `${p.dy}px`,
                  ['--rot' as string]: `${p.rot}deg`,
                  animation: `sp-shatter-fall ${p.dur}s ease-in forwards`,
                }}
              />
            ))}
        </div>
      </div>

      {/* 首次使用引导 */}
      <Tour
        open={tourOpen}
        onClose={closeTour}
        onFinish={closeTour}
        steps={[
          {
            title: '① 拖入控件',
            description: '从左侧控件面板把「输入 / 处理 / 输出」控件拖进画布。',
            target: () => panelRef.current!,
          },
          {
            title: '② 连线成流',
            description: '从节点右侧圆点拖出连线，接到下一个节点左侧圆点，组成数据流。',
            target: () => canvasWrapRef.current!,
          },
          {
            title: '③ 配置参数',
            description: '点击节点，在右侧抽屉里按表单填参数；节点右上角的角标会提示必填项是否已配齐。',
            target: () => canvasWrapRef.current!,
          },
          {
            title: '④ 保存上线',
            description: '保存时会自动校验 DAG 合法性；通过后回作业列表点「上线」即可运行。',
            target: () => saveBtnRef.current!,
          },
        ]}
      />

      {/* 参数抽屉 */}
      <Drawer
        title={selectedNode ? `参数配置：${selectedNode.data.name}` : '参数配置'}
        open={!!selectedNode}
        onClose={() => setSelectedNodeId(null)}
        width={380}
        mask={false}
      >
        {selectedNode && (
          <>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              控件编码：{selectedNode.data.componentCode}
            </Typography.Paragraph>
            <Form form={paramForm} layout="vertical" onValuesChange={onParamValuesChange}>
              <ParamFormItems schema={selectedNode.data.schema} />
            </Form>
          </>
        )}
      </Drawer>
    </div>
  );
}

export default function JobEditor() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
