import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { toApiError } from './apiError';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export const apiClient = axios.create({ baseURL: API_URL });

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// token หมดอายุ → ออกจากระบบ แล้วส่ง error เป็น { status, code, message } ให้ทุกหน้าใช้เหมือนกัน
apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    const apiError = toApiError(err);
    if (apiError.status === 401 && useAuthStore.getState().token) useAuthStore.getState().logout();
    return Promise.reject(apiError);
  },
);

export const data = <T,>(p: Promise<{ data: T }>) => p.then((r) => r.data);
