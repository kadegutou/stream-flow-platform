/**
 * DAG 画布 — ReactFlow 封装
 *
 *  - nodes/edges 由 editorStore 统一管理（配置面板/保存序列化共用）
 *  - 拖放建节点（控件元数据来自 componentStore）
 *  - isValidConnection: 类型方向 / 自连 / 重复边 / 单入边 / 环检测
 *  - 删除由 React Flow deleteKeyCode 处理（不要在 window 上重复监听，
 *    否则会在配置面板输入时误删节点）
 */

import { useCallback, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  BackgroundVariant,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from 'reactflow'
import { message } from 'antd'
import 'reactflow/dist/style.css'

import CustomNode from '@/components/CustomNode'
import { useEditorStore } from '@/stores/editorStore'
import { useComponentStore } from '@/stores/componentStore'
import type { ComponentType } from '@/types'

// 注册自定义节点类型
const nodeTypes = { customNode: CustomNode }

const defaultEdgeOptions = {
  animated: true,
  style: { stroke: '#1677ff', strokeWidth: 2 },
}

// 控件类型的拓扑层级: 连线只允许低层级 → 高层级（process → process 允许）
const TYPE_ORDER: Record<ComponentType, number> = { input: 0, process: 1, output: 2 }

// 节流非法连线提示（isValidConnection 在拖动悬停时会高频触发）
let lastWarnAt = 0
function warnOnce(text: string) {
  if (Date.now() - lastWarnAt > 800) {
    lastWarnAt = Date.now()
    message.warning(text)
  }
}

/** 从 target 沿边反向可达 source 则成环 */
function createsCycle(edges: Edge[], source: string, target: string): boolean {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    const list = adj.get(e.source) || []
    list.push(e.target)
    adj.set(e.source, list)
  }
  const stack = [target]
  const visited = new Set<string>()
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === source) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    for (const next of adj.get(cur) || []) stack.push(next)
  }
  return false
}

export default function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)

  const nodes = useEditorStore(s => s.nodes)
  const edges = useEditorStore(s => s.edges)
  const onNodesChange = useEditorStore(s => s.onNodesChange)
  const onEdgesChange = useEditorStore(s => s.onEdgesChange)
  const onConnect = useEditorStore(s => s.onConnect)
  const addNode = useEditorStore(s => s.addNode)
  const selectNode = useEditorStore(s => s.selectNode)

  // ── 连线校验 ──
  const isValidConnection = useCallback((conn: Connection): boolean => {
    const { nodes: ns, edges: es } = useEditorStore.getState()
    const source = ns.find(n => n.id === conn.source)
    const target = ns.find(n => n.id === conn.target)
    if (!source || !target) return false

    if (conn.source === conn.target) {
      warnOnce('不能连接节点自身')
      return false
    }

    const sType = source.data.componentType as ComponentType
    const tType = target.data.componentType as ComponentType
    if (tType === 'input') {
      warnOnce('输入控件没有输入接口')
      return false
    }
    if (sType === 'output') {
      warnOnce('输出控件没有输出接口')
      return false
    }
    if (TYPE_ORDER[sType] > TYPE_ORDER[tType]) {
      warnOnce('连线方向只能是 输入 → 处理 → 输出')
      return false
    }
    if (es.some(e => e.source === conn.source && e.target === conn.target)) {
      warnOnce('两个节点之间已存在连线')
      return false
    }
    if (es.some(e => e.target === conn.target)) {
      warnOnce('该节点已有上游输入，每个节点仅支持一条入边')
      return false
    }
    if (createsCycle(es, conn.source!, conn.target!)) {
      warnOnce('该连线会形成环路，DAG 不允许环')
      return false
    }
    return true
  }, [])

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

      const meta = useComponentStore.getState().getByName(componentName)
      if (!meta) {
        message.error(`未知控件: ${componentName}`)
        return
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode: Node = {
        id: `${componentName}-${Date.now()}`,
        type: 'customNode',
        position,
        data: {
          label: meta.display_name,
          componentName: meta.name,
          componentType: meta.type,
          config: {},
        },
      }

      addNode(newNode)
    },
    [reactFlowInstance, addNode],
  )

  // ── 节点选中 ──
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    selectNode(node.id)
  }, [selectNode])

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  return (
    <div ref={reactFlowWrapper} style={{ height: '100%', background: '#f5f5f5' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
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
