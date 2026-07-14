import { create } from 'zustand'
import type { Node, Edge } from 'reactflow'

interface EditorStore {
  // 作业编辑状态
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  selectedComponentName: string | null
  selectedConfig: Record<string, unknown> | null

  // 操作
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  addNode: (node: Node) => void
  removeNode: (id: string) => void
  selectNode: (id: string | null) => void
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedComponentName: null,
  selectedConfig: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),

  removeNode: (id) => set((s) => ({
    nodes: s.nodes.filter(n => n.id !== id),
    edges: s.edges.filter(e => e.source !== id && e.target !== id),
    selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    selectedComponentName: s.selectedNodeId === id ? null : s.selectedComponentName,
    selectedConfig: s.selectedNodeId === id ? null : s.selectedConfig,
  })),

  selectNode: (id) => {
    if (!id) {
      set({ selectedNodeId: null, selectedComponentName: null, selectedConfig: null })
      return
    }
    const node = get().nodes.find(n => n.id === id)
    set({
      selectedNodeId: id,
      selectedComponentName: node?.data?.componentName || null,
      selectedConfig: node?.data?.config || null,
    })
  },

  updateNodeConfig: (id, config) => set((s) => ({
    nodes: s.nodes.map(n =>
      n.id === id ? { ...n, data: { ...n.data, config } } : n
    ),
    selectedConfig: config,
  })),
}))
