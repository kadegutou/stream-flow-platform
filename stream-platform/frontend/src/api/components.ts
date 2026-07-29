import request from './request';
import type { ComponentDef } from '../types';

export function listComponents() {
  return request.get<unknown, ComponentDef[]>('/components');
}
