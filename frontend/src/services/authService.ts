import { apiClient } from './apiClient';
import type { Role, User } from '../types/user';

export interface AuthResponse {
  user: User;
  expiresIn: number;
}

export const authService = {
  register: (input: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    businessName: string;
    taxId: string;
    password: string;
    role: Exclude<Role, 'ADMIN'>;
  }) =>
    apiClient.post<AuthResponse>('/auth/register', input).then(({ data }) => data),
  login: (input: { email: string; password: string }) =>
    apiClient.post<AuthResponse>('/auth/login', input).then(({ data }) => data),
  logout: () => apiClient.post('/auth/logout'),
};
