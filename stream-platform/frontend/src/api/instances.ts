import request from './request';
import type { JobInstance, JobMetric } from '../types';

export function listJobInstances(jobId: number) {
  return request.get<unknown, JobInstance[]>(`/jobs/${jobId}/instances`);
}

export function getInstanceMetrics(instanceId: number) {
  return request.get<unknown, JobMetric[]>(`/instances/${instanceId}/metrics`);
}

/** Worker 节点 */
export interface WorkerNode {
  id: number;
  nodeCode: string;
  address: string;
  status: string;
  lastHeartbeat: string;
}

export function listWorkers() {
  return request.get<unknown, WorkerNode[]>('/workers');
}
