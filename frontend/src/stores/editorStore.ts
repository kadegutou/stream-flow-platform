import { create } from 'zustand'
import type { Node, Edge, Component } from '@/types'

interface EditorStore {
  // 作业编辑状态
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null

  // 控件库
  componentLibrary: Component[]

  // 操作
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  addNode: (node: Node) => void
  removeNode: (id: string) => void
  selectNode: (id: string | null) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  componentLibrary: [],

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
  removeNode: (id) => set((s) => ({
    nodes: s.nodes.filter(n => n.id !== id),
    edges: s.edges.filter(e => e.source !== id && e.target !== id),
  })),
  selectNode: (id) => set({ selectedNodeId: id }),
}))
