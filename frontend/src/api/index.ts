import axios from 'axios'
import type { ApiResponse, PaginatedData, User, Component, Job, Execution } from '@/types'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

http.interceptors.response.use(
  res => res.data,
  err => Promise.reject(err),
)

// ──── 用户 ────
export const userApi = {
  list: (params?: { page?: number; size?: number }) =>
    http.get<any, ApiResponse<PaginatedData<User>>>('/users', { params }),
  get: (id: number) =>
    http.get<any, ApiResponse<User>>(`/users/${id}`),
  create: (data: Partial<User>) =>
    http.post<any, ApiResponse<User>>('/users', data),
  update: (id: number, data: Partial<User>) =>
    http.put<any, ApiResponse<User>>(`/users/${id}`, data),
  delete: (id: number) =>
    http.delete<any, ApiResponse<void>>(`/users/${id}`),
}

// ──── 控件 ────
export const componentApi = {
  list: (params?: { type?: string; page?: number; size?: number }) =>
    http.get<any, ApiResponse<PaginatedData<Component>>>('/components', { params }),
  get: (id: number) =>
    http.get<any, ApiResponse<Component>>(`/components/${id}`),
  create: (data: Partial<Component>) =>
    http.post<any, ApiResponse<Component>>('/components', data),
  update: (id: number, data: Partial<Component>) =>
    http.put<any, ApiResponse<Component>>(`/components/${id}`, data),
  delete: (id: number) =>
    http.delete<any, ApiResponse<void>>(`/components/${id}`),
  // 内置控件列表（含 config_schema）
  listBuiltIn: () =>
    http.get<any, ApiResponse<any[]>>('/components/built-in'),
}
  delete: (id: number) =>
    http.delete<any, ApiResponse<void>>(`/components/${id}`),
}

// ──── 作业 ────
export const jobApi = {
  list: (params?: { status?: string; page?: number; size?: number }) =>
    http.get<any, ApiResponse<PaginatedData<Job>>>('/jobs', { params }),
  get: (id: number) =>
    http.get<any, ApiResponse<Job>>(`/jobs/${id}`),
  create: (data: Partial<Job>) =>
    http.post<any, ApiResponse<Job>>('/jobs', data),
  update: (id: number, data: Partial<Job>) =>
    http.put<any, ApiResponse<Job>>(`/jobs/${id}`, data),
  delete: (id: number) =>
    http.delete<any, ApiResponse<void>>(`/jobs/${id}`),
  online: (id: number) =>
    http.post<any, ApiResponse<void>>(`/jobs/${id}/online`),
  offline: (id: number) =>
    http.post<any, ApiResponse<void>>(`/jobs/${id}/offline`),
  status: (id: number) =>
    http.get<any, ApiResponse<Execution>>(`/jobs/${id}/status`),
  // DAG 校验 (Kahn 算法)
  validate: (data: { nodes: unknown[]; edges: unknown[] }) =>
    http.post<any, ApiResponse<{
      valid: boolean
      node_count: number
      edge_count: number
      has_cycle: boolean
      errors: string[]
    }>>('/jobs/validate', data),
}
