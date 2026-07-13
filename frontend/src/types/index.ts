// 用户
export interface User {
  id: number
  username: string
  email: string
  role: 'admin' | 'user'
  created_at: string
  updated_at: string
}

// 控件定义
export interface Component {
  id: number
  name: string
  display_name: string
  type: 'input' | 'process' | 'output'
  config_schema: Record<string, unknown>
  description: string
  icon: string
}

// 作业状态
export type JobStatus = 'draft' | 'online' | 'offline' | 'error'

// 作业
export interface Job {
  id: number
  name: string
  description: string
  status: JobStatus
  dag_config: DAGConfig
  created_by: number
  created_at: string
  updated_at: string
}

// DAG 图配置
export interface DAGConfig {
  nodes: DAGNode[]
  edges: DAGEdge[]
}

export interface DAGNode {
  id: string
  component_id: number
  component_type: string
  position: { x: number; y: number }
  config: Record<string, unknown>
}

export interface DAGEdge {
  id: string
  source: string
  target: string
  source_handle?: string
  target_handle?: string
}

// 执行记录
export interface Execution {
  id: number
  job_id: number
  status: 'running' | 'success' | 'failed'
  started_at: string
  finished_at: string
  log: string
  error_msg: string
}

// API 通用响应
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface PaginatedData<T> {
  records: T[]
  total: number
  page: number
  size: number
}
