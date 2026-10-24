import { apiClient } from './apiClient';

// TODO: implement space endpoints
export const spaceService = {
  ping: () => apiClient.get('/space/ping'),
};
