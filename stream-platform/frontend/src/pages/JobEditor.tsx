import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
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
import { Button, Drawer, Form, Input, InputNumber, message, Select, Space, Switch, Typography } from 'antd';
import { ArrowLeftOutlined, LayoutOutlined, SaveOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { listComponents } from '../api/components';
import { getJob, updateJob } from '../api/jobs';
import type { ComponentCategory, ComponentDef, Dag, Job, ParamSchema } from '../types';
import { CATEGORY_LABEL } from '../components/CategoryTag';

/* ---------- 画布节点数据 ---------- */

interface ComponentNodeData extends Record<string, unknown> {
  componentCode: string;
  name: string;
  category: ComponentCategory;
  params: Record<string, unknown>;
  schema?: ParamSchema;
}

type ComponentFlowNode = Node<ComponentNodeData, 'component'>;

const CATEGORY_HEX: Record<ComponentCategory, string> = {
  SOURCE: '#52c41a',
  PROCESS: '#1677ff',
  SINK: '#fa8c16',
};

function ComponentNode({ data, selected }: NodeProps<ComponentFlowNode>) {
  const color = CATEGORY_HEX[data.category];
  return (
    <div
      style={{
        border: `2px solid ${color}`,
        borderRadius: 6,
        background: '#fff',
        padding: '8px 12px',
        minWidth: 140,
        boxShadow: selected ? `0 0 0 3px ${color}44` : '0 1px 4px rgba(0,0,0,.15)',
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={{ fontSize: 11, color, fontWeight: 600 }}>
        {data.category} · {CATEGORY_LABEL[data.category]}
      </div>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{data.name}</div>
      <div style={{ fontSize: 11, color: '#999' }}>{data.componentCode}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { component: ComponentNode };

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

  const [job, setJob] = useState<Job | null>(null);
  const [components, setComponents] = useState<ComponentDef[]>([]);
  const [nodes, setNodes] = useState<ComponentFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nodeSeq = useRef(1);
  const [paramForm] = Form.useForm();

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
        }));
        nodeSeq.current = maxSeq + 1;
        // 有内容时做一次分层布局，让加载出来的图更整齐
        setNodes(flowNodes.length > 0 ? layeredLayout(flowNodes, flowEdges) : flowNodes);
        setEdges(flowEdges);
      } catch {
        message.error('加载作业失败');
      }
    })();
  }, [id]);

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
      setEdges((eds) => addEdge({ ...conn, id: `e-${conn.source}-${conn.target}-${Date.now()}` }, eds)),
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

  // 点击节点 → 打开参数抽屉
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  useEffect(() => {
    if (selectedNode) {
      paramForm.setFieldsValue(selectedNode.data.params);
    }
  }, [selectedNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onParamValuesChange = (_: unknown, allValues: Record<string, unknown>) => {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, params: allValues } } : n)),
    );
  };

  // 保存 DAG
  const onSave = async () => {
    if (!job) return;
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
          background: '#fff',
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
          <Button icon={<LayoutOutlined />} onClick={onAutoLayout}>
            自动布局
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>
            保存
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: 8, minHeight: 0 }}>
        {/* 左侧控件面板 */}
        <div
          style={{
            width: 220,
            background: '#fff',
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
                    background: '#fafafa',
                    fontSize: 13,
                  }}
                >
                  {comp.name}
                  <div style={{ fontSize: 11, color: '#999' }}>{comp.code}</div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 画布 */}
        <div style={{ flex: 1, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
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
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background gap={16} />
            <Controls />
          </ReactFlow>
        </div>
      </div>

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
