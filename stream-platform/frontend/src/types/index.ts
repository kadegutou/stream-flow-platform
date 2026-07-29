/** 用户 */
export interface User {
  id: number;
  username: string;
  nickname: string;
  role: 'ADMIN' | 'USER';
  status: number; // 1 启用 0 禁用
  createdAt?: string;
  updatedAt?: string;
}

/** 登录响应 */
export interface LoginResponse {
  token: string;
  nickname: string;
  role: 'ADMIN' | 'USER';
}

export type ComponentCategory = 'SOURCE' | 'PROCESS' | 'SINK';

/** JSON Schema（控件参数描述，仅覆盖前端渲染所需子集） */
export interface JsonSchemaProperty {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  title?: string;
  description?: string;
  default?: unknown;
  enum?: (string | number)[];
  items?: { type?: string };
}

export interface ParamSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/** 控件定义 */
export interface ComponentDef {
  id: number;
  code: string;
  name: string;
  category: ComponentCategory;
  description?: string;
  icon?: string;
  paramSchema?: ParamSchema;
}

export type InstanceStatus = 'PENDING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'FAILED';

/** DAG 定义 */
export interface DagNode {
  id: string;
  componentCode: string;
  params: Record<string, unknown>;
}

export interface DagEdge {
  from: string;
  to: string;
}

export interface Dag {
  nodes: DagNode[];
  edges: DagEdge[];
}

/** 作业 */
export interface Job {
  id: number;
  name: string;
  description?: string;
  version: number;
  parallelism: number;
  dag?: Dag;
  updatedAt?: string;
  runningStatus?: InstanceStatus | null;
}

/** 作业运行实例 */
export interface JobInstance {
  id: number;
  jobId: number;
  jobVersion: number;
  status: InstanceStatus;
  totalRows: number;
  errorMsg?: string;
  startedAt?: string;
  stoppedAt?: string;
  createdAt?: string;
  /** 前端聚合时补充的作业名 */
  jobName?: string;
}

/** 吞吐采样点 */
export interface JobMetric {
  rowsPerSec: number;
  totalRows: number;
  sampledAt: string;
}
