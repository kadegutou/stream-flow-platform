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
  type: ComponentType
  config_schema: Record<string, unknown>
  description: string
  icon: string
}

export type ComponentType = 'input' | 'process' | 'output'

// JSON Schema 属性
export interface SchemaProperty {
  type: string
  title?: string
  default?: unknown
  enum?: unknown[]
}

export interface ConfigSchema {
  type: string
  properties: Record<string, SchemaProperty>
  required?: string[]
}

// 内置控件 (GET /api/components/built-in)
export interface BuiltInComponent {
  name: string
  display_name: string
  type: ComponentType
  config_schema: ConfigSchema
}

// 作业状态
export type JobStatus = 'draft' | 'online' | 'offline' | 'error'

// 作业 (dag_config 后端以 JSON 字符串存储)
export interface Job {
  id: number
  name: string
  description: string
  status: JobStatus
  dag_config: string
  created_by: number
  created_at: string
  updated_at: string
}

// DAG 图配置
export interface DAGConfig {
  nodes: DAGNode[]
  edges: DAGEdge[]
}

// DAG 节点 (与后端 dag_executor 对齐)
export interface DAGNode {
  id: string
  component_name: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  data?: { label: string }
}

export interface DAGEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

// 执行记录
export interface Execution {
  id: number
  job_id: number
  status: 'running' | 'success' | 'failed'
  rows_processed: number
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
