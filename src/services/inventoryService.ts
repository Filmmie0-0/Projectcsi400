import { apiClient } from './apiClient';

// TODO: implement inventory endpoints
export const inventoryService = {
  ping: () => apiClient.get('/inventory/ping'),
};
