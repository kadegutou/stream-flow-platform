import request from './request';
import type { Dag, Job } from '../types';

export interface JobPayload {
  name: string;
  description?: string;
  parallelism: number;
  dag?: Dag;
}

export function listJobs() {
  return request.get<unknown, Job[]>('/jobs');
}

export function getJob(id: number) {
  return request.get<unknown, Job>(`/jobs/${id}`);
}

export function createJob(data: JobPayload) {
  return request.post<unknown, Job>('/jobs', data);
}

export function updateJob(id: number, data: JobPayload) {
  return request.put<unknown, Job>(`/jobs/${id}`, data);
}

export function deleteJob(id: number) {
  return request.delete<unknown, void>(`/jobs/${id}`);
}

export function onlineJob(id: number) {
  return request.post<unknown, void>(`/jobs/${id}/online`);
}

export function offlineJob(id: number) {
  return request.post<unknown, void>(`/jobs/${id}/offline`);
}
