import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url ?? '';
    if (
      error.response?.status === 401 &&
      !requestUrl.endsWith('/auth/login') &&
      !requestUrl.endsWith('/auth/register') &&
      !requestUrl.endsWith('/auth/logout')
    ) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);
