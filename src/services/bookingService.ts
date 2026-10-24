import { apiClient } from './apiClient';

// TODO: implement booking endpoints
export const bookingService = {
  ping: () => apiClient.get('/booking/ping'),
};
