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
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Drawer, Form, Input, InputNumber, message, Modal, Select, Space, Switch, Tour, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleFilled, DeleteOutlined, ExclamationCircleFilled, ExportOutlined, ImportOutlined, LayoutOutlined, LeftOutlined, NodeExpandOutlined, QuestionCircleOutlined, RedoOutlined, RightOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useThemeStore } from '../store/theme';
import { listComponents } from '../api/components';
import { getJob, updateJob } from '../api/jobs';
import type { ComponentCategory, ComponentDef, Dag, Job, ParamSchema } from '../types';
import { CATEGORY_HEX, CATEGORY_LABEL } from '../components/CategoryTag';

/* ---------- 画布节点数据 ---------- */

interface ComponentNodeData extends Record<string, unknown> {
  componentCode: string;
  name: string;
  category: ComponentCategory;
  params: Record<string, unknown>;
  schema?: ParamSchema;
}

type ComponentFlowNode = Node<ComponentNodeData, 'component'>;

const CATEGORY_BG: Record<ComponentCategory, string> = {
  SOURCE: '#f6ffed',
  PROCESS: '#f0f5ff',
  SINK: '#fff7e6',
};

const CATEGORY_ICON: Record<ComponentCategory, React.ReactNode> = {
  SOURCE: <ImportOutlined />,
  PROCESS: <NodeExpandOutlined />,
  SINK: <ExportOutlined />,
};

function ComponentNode(props: NodeProps<ComponentFlowNode>) {
  const dark = useThemeStore((s) => s.dark);
  const { data, selected } = props;
  const color = CATEGORY_HEX[data.category];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderRadius: 10,
        background: dark ? '#1b2334' : '#fff',
        minWidth: 168,
        overflow: 'hidden',
        border: `1px solid ${selected ? color : dark ? '#2c3a55' : '#e4e8f0'}`,
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
          background: CATEGORY_BG[data.category],
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
            <CheckCircleFilled style={{ color: '#52c41a' }} />
          ) : (
            <ExclamationCircleFilled style={{ color: '#fa8c16' }} />
          )}
        </span>
        <div style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: 0.5 }}>
          {data.category} · {CATEGORY_LABEL[data.category]}
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, color: dark ? '#d5dbea' : '#1f2d3d', marginTop: 1 }}>{data.name}</div>
        <div style={{ fontSize: 10, color: dark ? '#5f6b84' : '#a0a6b5', fontFamily: 'monospace' }}>{data.componentCode}</div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { component: ComponentNode };

/** 判断节点必填参数是否已配置完整 */
function isNodeConfigured(data: ComponentNodeData): boolean {
  const required = data.schema?.required ?? [];
  if (required.length === 0) return true;
  return required.every((key) => {
    const v = data.params[key];
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
}

/** 连线样式：平滑贝塞尔 + 流动虚线动画 */
const FLOW_EDGE_STYLE = {
  type: 'smoothstep' as const,
  animated: true,
  style: { stroke: '#9aa4b8', strokeWidth: 1.6 },
};

/* ---------- 参数表单（按 JSON Schema 动态渲染） ---------- */

function ParamFormItems({ schema }: { schema?: ParamSchema }) {
  const properties = schema?.properties ?? {};
  const required = schema?.required ?? [];
  const entries = Object.entries(properties);

  if (entries.length === 0) {
    return <Typography.Text type="secondary">该控件无需配置参数</Typography.Text>;
  }

  return (
    <>
      {entries.map(([key, prop]) => {
        const label = prop.title || key;
        const rules = required.includes(key)
          ? [{ required: true, message: `请填写${label}` }]
          : [];

        // enum → Select
        if (prop.enum && prop.enum.length > 0) {
          return (
            <Form.Item key={key} name={key} label={label} rules={rules} tooltip={prop.description}>
              <Select
                allowClear
                options={prop.enum.map((v) => ({ value: v, label: String(v) }))}
                placeholder="请选择"
              />
            </Form.Item>
          );
        }
        // array(string) → Select tags
        if (prop.type === 'array' && (!prop.items?.type || prop.items.type === 'string')) {
          return (
            <Form.Item key={key} name={key} label={label} rules={rules} tooltip={prop.description}>
              <Select mode="tags" open={false} placeholder="输入后回车添加" suffixIcon={null} />
            </Form.Item>
          );
        }
        // boolean → Switch
        if (prop.type === 'boolean') {
          return (
            <Form.Item
              key={key}
              name={key}
              label={label}
              rules={rules}
              tooltip={prop.description}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          );
        }
        // number / integer → InputNumber
        if (prop.type === 'number' || prop.type === 'integer') {
          return (
            <Form.Item key={key} name={key} label={label} rules={rules} tooltip={prop.description}>
              <InputNumber style={{ width: '100%' }} precision={prop.type === 'integer' ? 0 : undefined} />
            </Form.Item>
          );
        }
        // string / 其他 → Input
        return (
          <Form.Item key={key} name={key} label={label} rules={rules} tooltip={prop.description}>
            <Input placeholder={prop.description || label} />
          </Form.Item>
        );
      })}
    </>
  );
}

/* ---------- 简单从左到右分层布局 ---------- */

function layeredLayout(nodes: ComponentFlowNode[], edges: Edge[]): ComponentFlowNode[] {
  const layerOf = new Map<string, number>();
  nodes.forEach((n) => layerOf.set(n.id, 0));
  // 迭代松弛计算层级（DAG 场景足够）
  for (let i = 0; i < nodes.length; i++) {
    edges.forEach((e) => {
      const fromLayer = layerOf.get(e.source) ?? 0;
      const toLayer = layerOf.get(e.target) ?? 0;
      if (fromLayer + 1 > toLayer) layerOf.set(e.target, fromLayer + 1);
    });
  }
  const layerIndex = new Map<number, number>();
  return nodes.map((n) => {
    const layer = layerOf.get(n.id) ?? 0;
    const idx = layerIndex.get(layer) ?? 0;
    layerIndex.set(layer, idx + 1);
    return { ...n, position: { x: layer * 260 + 40, y: idx * 120 + 40 } };
  });
}

/* ---------- 画布主体 ---------- */

function FlowCanvas() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { screenToFlowPosition } = useReactFlow();
  const dark = useThemeStore((s) => s.dark);

  const [job, setJob] = useState<Job | null>(null);
  const [components, setComponents] = useState<ComponentDef[]>([]);
  const [nodes, setNodes] = useState<ComponentFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [panelHover, setPanelHover] = useState(false);
  const [draggingNode, setDraggingNode] = useState(false);
  const [trashActive, setTrashActive] = useState(false);
  const [shatter, setShatter] = useState<{ x: number; y: number; color: string } | null>(null);
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
      } catch {
        message.error('加载作业失败');
      }
    })();
  }, [id]);

  /* ---------- 撤销 / 重做 ---------- */

  /** 历史快照栈（nodes + edges）。防抖入栈，拖动/连线的中间态不记录 */
  const historyRef = useRef<{ nodes: ComponentFlowNode[]; edges: Edge[] }[]>([]);
  const historyIndexRef = useRef(-1);
  const loadedRef = useRef(false); // DAG 加载完成前不记历史，避免把空画布当成可撤销的初始态
  const [historyTick, setHistoryTick] = useState(0); // 驱动按钮可用态刷新

  // nodes/edges 稳定 500ms 后记一次快照；与当前指针快照相同则跳过（撤销/重做自身触发的变化）
  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      const snapshot = {
        nodes: nodes.map((n) => ({ ...n, position: { ...n.position }, data: { ...n.data } })),
        edges: edges.map((e) => ({ ...e })),
      };
      const stack = historyRef.current;
      const cur = stack[historyIndexRef.current];
      if (cur && JSON.stringify(cur) === JSON.stringify(snapshot)) return;
      stack.splice(historyIndexRef.current + 1); // 产生新分支时丢弃重做栈
      stack.push(snapshot);
      if (stack.length > 60) stack.shift(); // 上限 60 步，防内存增长
      historyIndexRef.current = stack.length - 1;
      setHistoryTick((v) => v + 1);
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  const applySnapshot = useCallback((index: number) => {
    const snap = historyRef.current[index];
    if (!snap) return;
    historyIndexRef.current = index;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setSelectedNodeId(null);
    setHistoryTick((v) => v + 1);
  }, []);

  const undo = useCallback(() => applySnapshot(historyIndexRef.current - 1), [applySnapshot]);
  const redo = useCallback(() => applySnapshot(historyIndexRef.current + 1), [applySnapshot]);

  // 历史栈存在 ref 里（避免每次入栈都重建回调），用 historyTick 驱动按钮可用态重算
  const { canUndo, canRedo } = useMemo(
    () => ({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1,
    }),
    [historyTick],
  );

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
      const color = CATEGORY_HEX[node.data.category];
      setNodes((nds) => nds.filter((n) => n.id !== node.id));
      setEdges((eds) => eds.filter((ed) => ed.source !== node.id && ed.target !== node.id));
      setSelectedNodeId((sel) => (sel === node.id ? null : sel));
      if (wrapRect) {
        // 动画起点上移一段，避免碎裂位置太靠下
        setShatter({ x: clientX - wrapRect.left, y: clientY - wrapRect.top - 60, color });
        setTimeout(() => setShatter(null), 900);
      }
      message.success(`已删除控件：${node.data.name}`);
    },
    [],
  );

  // 点击节点 → 打开参数抽屉
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  useEffect(() => {
    if (selectedNode) {
      // setFieldsValue 是 merge 语义：不清空会残留上一节点同名字段，污染当前节点参数
      paramForm.resetFields();
      paramForm.setFieldsValue(selectedNode.data.params);
    }
  }, [selectedNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 保存前本地预检：结构 + 必填参数，问题逐条列出
  const validateDag = (): string[] => {
    const problems: string[] = [];
    if (nodes.length === 0) {
      problems.push('画布为空：请至少拖入一个输入控件和一个输出控件');
      return problems;
    }
    const sources = nodes.filter((n) => n.data.category === 'SOURCE');
    const sinks = nodes.filter((n) => n.data.category === 'SINK');
    if (sources.length === 0) problems.push('缺少输入控件（SOURCE）');
    if (sinks.length === 0) problems.push('缺少输出控件（SINK）');

    // 孤立节点（无任何连线）
    const connected = new Set<string>();
    edges.forEach((e) => {
      connected.add(e.source);
      connected.add(e.target);
    });
    nodes.forEach((n) => {
      if (!connected.has(n.id) && nodes.length > 1) {
        problems.push(`「${n.data.name}」未连线`);
      }
    });

    // 输入控件不应有入边、输出控件不应有出边
    edges.forEach((e) => {
      const from = nodes.find((n) => n.id === e.source);
      const to = nodes.find((n) => n.id === e.target);
      if (from?.data.category === 'SINK') problems.push(`输出控件「${from.data.name}」不能再连出`);
      if (to?.data.category === 'SOURCE') problems.push(`输入控件「${to.data.name}」不能有输入连线`);
    });

    // 必填参数缺失
    nodes.forEach((n) => {
      if (!isNodeConfigured(n.data)) {
        const missing = (n.data.schema?.required ?? []).filter((key) => {
          const v = n.data.params[key];
          return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
        });
        problems.push(`「${n.data.name}」缺少必填参数：${missing.join('、')}`);
      }
    });
    return [...new Set(problems)];
  };

  // 保存 DAG
  const onSave = async () => {
    if (!job) return;
    const problems = validateDag();
    if (problems.length > 0) {
      Modal.warning({
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
      message.success(`已保存（版本 v${updated.version}）`);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onAutoLayout = () => {
    setNodes((nds) => layeredLayout(nds, edges));
    message.success('已自动布局');
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 96px)' }}>
      {/* 顶部工具栏 */}
      <div
        style={{
          background: dark ? '#141b2b' : '#fff',
          padding: '8px 16px',
          marginBottom: 8,
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/jobs')}>
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
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const nearRight = rect.right - e.clientX <= 40;
            const nearMiddle = Math.abs(e.clientY - (rect.top + rect.height / 2)) <= 100;
            setPanelHover(nearRight && nearMiddle);
          }}
          onMouseLeave={() => setPanelHover(false)}
          style={{ position: 'relative', width: panelCollapsed ? 16 : 220, flexShrink: 0, transition: 'width .15s' }}
        >
          {!panelCollapsed && (
            <div
              style={{
                height: '100%',
                background: dark ? '#141b2b' : '#fff',
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
                  <Typography.Text strong style={{ color: CATEGORY_HEX[group.category], fontSize: 12 }}>
                    {group.category} {CATEGORY_LABEL[group.category]}
                  </Typography.Text>
                  {group.items.map((comp) => (
                    <div
                      key={comp.code}
                      draggable
                      onDragStart={(e) => onDragStart(e, comp)}
                      title={comp.description}
                      style={{
                        border: `1px solid ${CATEGORY_HEX[comp.category]}`,
                        borderLeft: `4px solid ${CATEGORY_HEX[comp.category]}`,
                        borderRadius: 4,
                        padding: '6px 8px',
                        margin: '6px 0',
                        cursor: 'grab',
                        background: dark ? '#1b2334' : '#fafafa',
                        fontSize: 13,
                      }}
                    >
                      {comp.name}
                      <div style={{ fontSize: 11, color: dark ? '#7d8899' : '#999' }}>{comp.code}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {panelCollapsed && (
            <div style={{ height: '100%', background: dark ? '#1b2334' : '#f0f0f0', borderRadius: 8 }} />
          )}
          {/* 悬停面板区域时出现折叠/展开按钮：半透明、垂直居中、直边贴栏、外侧半圆 */}
          {panelHover && (
            <div
              onClick={() => setPanelCollapsed(!panelCollapsed)}
              title={panelCollapsed ? '展开控件栏' : '收起控件栏'}
              style={{
                position: 'absolute',
                top: '50%',
                right: -16,
                transform: 'translateY(-50%)',
                width: 26,
                height: 60,
                borderRadius: '0 26px 26px 0',
                background: dark ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.92)',
                border: `1px solid ${dark ? 'rgba(255,255,255,.16)' : 'rgba(20,30,48,.1)'}`,
                borderLeft: 'none',
                boxShadow: dark ? 'none' : '0 2px 8px rgba(20,30,48,.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 20,
                color: dark ? 'rgba(255,255,255,.75)' : '#5a6072',
                fontSize: 11,
                userSelect: 'none',
                transition: 'background .2s, color .2s',
              }}
            >
              {panelCollapsed ? <RightOutlined /> : <LeftOutlined />}
            </div>
          )}
        </div>

        {/* 画布 */}
        <div ref={canvasWrapRef} style={{ flex: 1, borderRadius: 8, overflow: 'hidden', background: dark ? '#0f1420' : '#fff', position: 'relative' }}>
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
          >
            <Background gap={16} color={dark ? '#232c42' : '#e8ebf2'} />
            <Controls />
            <MiniMap
              nodeColor={(n) => CATEGORY_HEX[(n.data as ComponentNodeData).category] ?? '#9aa4b8'}
              maskColor={dark ? 'rgba(15,20,32,.72)' : 'rgba(243,245,249,.72)'}
              bgColor={dark ? '#141b2b' : '#fff'}
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
                border: `2px dashed ${trashActive ? '#ff4d4f' : '#bbb'}`,
                background: trashActive ? (dark ? '#3a1f24' : '#fff1f0') : dark ? 'rgba(27,35,52,.92)' : 'rgba(255,255,255,.92)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: trashActive ? '#ff4d4f' : '#999',
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
            Array.from({ length: 24 }).map((_, i) => {
              const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.5;
              const spread = 40 + Math.random() * 80;
              const dx = Math.cos(angle) * spread;
              const dy = 220 + Math.random() * 260; // 总体向下坠落出画布
              const rot = Math.round((Math.random() - 0.5) * 720);
              const size = 6 + Math.random() * 8;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: shatter.x - size / 2,
                    top: shatter.y - size / 2,
                    width: size,
                    height: size,
                    borderRadius: 2,
                    background: shatter.color,
                    opacity: 0.9,
                    zIndex: 30,
                    pointerEvents: 'none',
                    ['--dx' as string]: `${dx.toFixed(0)}px`,
                    ['--dy' as string]: `${dy.toFixed(0)}px`,
                    ['--rot' as string]: `${rot}deg`,
                    animation: `sp-shatter-fall ${(0.55 + Math.random() * 0.3).toFixed(2)}s ease-in forwards`,
                  }}
                />
              );
            })}
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
