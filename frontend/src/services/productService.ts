import { apiClient } from './apiClient';

// TODO: implement product endpoints
export const productService = {
  ping: () => apiClient.get('/product/ping'),
};
