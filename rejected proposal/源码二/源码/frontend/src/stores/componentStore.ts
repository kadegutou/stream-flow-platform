/**
 * 控件注册表 Store
 *
 * 后端 GET /api/components/built-in 为控件元数据的唯一数据源，
 * 替代原先在 ComponentPanel / FlowCanvas / CustomNode 三处硬编码的注册表。
 */

import { create } from 'zustand'
import { componentApi } from '@/api'
import type { BuiltInComponent } from '@/types'

interface ComponentStore {
  builtIn: BuiltInComponent[]
  loading: boolean
  error: boolean

  /** 拉取内置控件列表（幂等，已加载或加载中时直接返回） */
  fetchBuiltIn: () => Promise<void>
  /** 按 name 查找控件元数据 */
  getByName: (name: string) => BuiltInComponent | undefined
}

export const useComponentStore = create<ComponentStore>((set, get) => ({
  builtIn: [],
  loading: false,
  error: false,

  fetchBuiltIn: async () => {
    const { builtIn, loading } = get()
    if (loading || builtIn.length > 0) return
    set({ loading: true, error: false })
    try {
      const res = await componentApi.listBuiltIn()
      set({ builtIn: res.data || [], loading: false })
    } catch {
      set({ loading: false, error: true })
    }
  },

  getByName: (name) => get().builtIn.find(c => c.name === name),
}))
