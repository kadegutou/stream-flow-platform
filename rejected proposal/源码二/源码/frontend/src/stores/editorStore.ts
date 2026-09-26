/**
 * 作业编辑器 Store — 画布状态的唯一数据源
 *
 * React Flow 官方推荐模式: nodes/edges 存于 Zustand，
 * 通过 applyNodeChanges / applyEdgeChanges 响应画布交互。
 * 配置面板、保存序列化均从本 store 读写。
 */

import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from 'reactflow'

interface EditorStore {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null

  // React Flow 事件
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  // 图操作
  addNode: (node: Node) => void
  selectNode: (id: string | null) => void
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void
  /** 加载已有作业 */
  setGraph: (nodes: Node[], edges: Edge[]) => void
  /** 新建作业 / 离开编辑器时清空 */
  resetGraph: () => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
    // 选中的节点被删除（Delete 键）时同步清空选中态
    const { nodes, selectedNodeId } = get()
    if (selectedNodeId && !nodes.some(n => n.id === selectedNodeId)) {
      set({ selectedNodeId: null })
    }
  },

  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (connection) =>
    set({ edges: addEdge({ ...connection, animated: true }, get().edges) }),

  addNode: (node) => set({ nodes: [...get().nodes, node] }),

  selectNode: (id) => set({ selectedNodeId: id }),

  updateNodeConfig: (id, config) =>
    set({
      nodes: get().nodes.map(n =>
        n.id === id ? { ...n, data: { ...n.data, config } } : n,
      ),
    }),

  setGraph: (nodes, edges) => set({ nodes, edges, selectedNodeId: null }),

  resetGraph: () => set({ nodes: [], edges: [], selectedNodeId: null }),
}))
