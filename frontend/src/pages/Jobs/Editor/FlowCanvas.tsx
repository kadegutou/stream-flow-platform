/**
 * DAG 画布 — ReactFlow 封装
 *
 * 参考 VibeETL Canvas.jsx:
 *  - 自定义节点 (CustomNode)
 *  - 拖放建节点 (含 component_name)
 *  - 删除键支持
 *  - 2D 背景 + 小地图
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
  Node,
  Edge,
  Connection,
  useNodesState,
  useEdgesState,
  ReactFlowInstance,
  BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'

import CustomNode from '@/components/CustomNode'

// 注册自定义节点类型
const nodeTypes = { customNode: CustomNode }

const defaultEdgeOptions = {
  animated: true,
  style: { stroke: '#1677ff', strokeWidth: 2 },
}

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'customNode',
    position: { x: 250, y: 50 },
    data: {
      label: 'CSV 输入',
      componentName: 'csv-input',
      config: { path: 'data/input.csv' },
    },
  },
  {
    id: '2',
    type: 'customNode',
    position: { x: 250, y: 220 },
    data: {
      label: '字段拼接',
      componentName: 'concat',
      config: { field_a: 'A', field_b: 'B', field_c: 'C' },
    },
  },
  {
    id: '3',
    type: 'customNode',
    position: { x: 250, y: 390 },
    data: {
      label: 'MySQL 输出',
      componentName: 'mysql-output',
      config: { table: 'result' },
    },
  },
]

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', animated: true },
]

// 控件名 → 显示名 + 分类
const COMPONENT_META: Record<string, { label: string; category: string }> = {
  'csv-input':    { label: 'CSV 输入',    category: 'input' },
  'excel-input':  { label: 'Excel 输入',  category: 'input' },
  'mysql-input':  { label: 'MySQL 输入',  category: 'input' },
  'kafka-input':  { label: 'Kafka 输入',  category: 'input' },
  'xml2json':     { label: 'XML → JSON',  category: 'process' },
  'json2xml':     { label: 'JSON → XML',  category: 'process' },
  'concat':       { label: '字段拼接',    category: 'process' },
  'redis-enrich': { label: 'Redis 扩充',  category: 'process' },
  'csv-output':   { label: 'CSV 输出',    category: 'output' },
  'excel-output': { label: 'Excel 输出',  category: 'output' },
  'mysql-output': { label: 'MySQL 输出',  category: 'output' },
  'kafka-output': { label: 'Kafka 输出',  category: 'output' },
}

export default function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // ── 连线 ──
  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  )

  // ── 拖入新节点 ──
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const componentName = event.dataTransfer.getData('application/reactflow')
      if (!componentName || !reactFlowInstance) return

      const meta = COMPONENT_META[componentName]
      if (!meta) return

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode: Node = {
        id: `${componentName}-${Date.now()}`,
        type: 'customNode',
        position,
        data: {
          label: meta.label,
          componentName,
          config: {},
        },
      }

      setNodes(nds => nds.concat(newNode))
    },
    [reactFlowInstance, setNodes],
  )

  // ── 节点选中 ──
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  // ── 键盘快捷键 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          setNodes(nds => nds.filter(n => n.id !== selectedNodeId))
          setEdges(eds => eds.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId))
          setSelectedNodeId(null)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedNodeId, setNodes, setEdges])

  return (
    <div ref={reactFlowWrapper} style={{ height: '100%', background: '#f5f5f5' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[16, 16]}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          style={{ background: '#f0f0f0' }}
        />
        <Panel position="bottom-left" style={{ fontSize: 12, color: '#999' }}>
          选中节点 → Delete 删除 | 拖拽连线 | 滚动缩放
        </Panel>
      </ReactFlow>
    </div>
  )
}
