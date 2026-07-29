import request from './request';
import type { User } from '../types';

export interface UserPayload {
  username: string;
  password?: string;
  nickname: string;
  role: 'ADMIN' | 'USER';
  status?: number;
}

export function listUsers() {
  return request.get<unknown, User[]>('/users');
}

export function createUser(data: UserPayload) {
  return request.post<unknown, User>('/users', data);
}

export function updateUser(id: number, data: UserPayload) {
  return request.put<unknown, User>(`/users/${id}`, data);
}

export function deleteUser(id: number) {
  return request.delete<unknown, void>(`/users/${id}`);
}
