import request from './request';
import type { LoginResponse } from '../types';

export function login(data: { username: string; password: string }) {
  return request.post<unknown, LoginResponse>('/auth/login', data);
}
