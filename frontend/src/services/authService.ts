import { apiClient, data } from './apiClient';
import type { AuthResponse, User, UserInput } from '../types/user';

// auth-service: /api/auth/*, /api/users/*
export const authService = {
  login: (email: string, password: string) => data(apiClient.post<AuthResponse>('/auth/login', { email, password })),
  register: (body: { email: string; password: string; fullName: string; phone: string }) =>
    data(apiClient.post<AuthResponse>('/auth/register', body)),
  logout: () => apiClient.post('/auth/logout').then(() => null),
  me: () => data(apiClient.get<User>('/auth/me')),

  listUsers: (role?: string) => data(apiClient.get<User[]>('/users', { params: { role } })),
  // ช่างที่ใช้งานอยู่ (แอดมิน + ช่าง เรียกได้; ช่างจะไม่เห็นค่าแรง)
  listTechnicians: () => data(apiClient.get<User[]>('/users/technicians')),
  createUser: (body: UserInput) => data(apiClient.post<User>('/users', body)),
  updateUser: (id: number, body: Partial<Pick<User, 'status' | 'fullName' | 'phone' | 'skills' | 'dailyWage'>>) =>
    data(apiClient.patch<User>(`/users/${id}`, body)),
};
