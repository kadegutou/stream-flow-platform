import request from './request';
import type { LoginResponse } from '../types';

export function login(data: { username: string; password: string }) {
  return request.post<unknown, LoginResponse>('/auth/login', data);
}

export function register(data: { username: string; password: string; nickname: string }) {
  return request.post<unknown, LoginResponse>('/auth/register', data);
}
