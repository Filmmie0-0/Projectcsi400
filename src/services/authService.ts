import { apiClient } from './apiClient';

// TODO: implement auth endpoints
export const authService = {
  ping: () => apiClient.get('/auth/ping'),
};
