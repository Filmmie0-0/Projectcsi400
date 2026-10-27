import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { toApiError } from './apiError';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

// withCredentials: ส่ง HttpOnly cookie ของ session ไปกับทุก request
export const apiClient = axios.create({ baseURL: API_URL, withCredentials: true });

// session หมดอายุ/ถูกเพิกถอน → ออกจากระบบ แล้วส่ง error เป็น { status, code, message } ให้ทุกหน้าใช้เหมือนกัน
apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    const apiError = toApiError(err);
    const url: string = err.config?.url ?? '';
    if (apiError.status === 401 && !/\/auth\/(login|register|logout)$/.test(url)) useAuthStore.getState().logout();
    return Promise.reject(apiError);
  },
);

export const data = <T,>(p: Promise<{ data: T }>) => p.then((r) => r.data);
