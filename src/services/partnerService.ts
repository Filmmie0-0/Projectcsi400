import axios from 'axios';
import { API_URL, apiClient, data } from './apiClient';
import type { InboxEvent, Partner, PartnerJobRequest, PartnerJobView, WebhookDelivery } from '../types/partner';

// แอดมินจัดการพาร์ทเนอร์ (JWT)
export const partnerService = {
  list: () => data(apiClient.get<Partner[]>('/partners')),
  create: (body: { name: string; ownerUserId: number; webhookUrl?: string }) =>
    data(apiClient.post<{ partnerId: number; apiKey: string; webhookSecret: string }>('/partners', body)),
  update: (id: number, body: { webhookUrl?: string; isActive?: boolean }) => data(apiClient.patch(`/partners/${id}`, body)),
  rotateKey: (id: number) => data(apiClient.post<{ apiKey: string }>(`/partners/${id}/rotate-key`)),
  deliveries: (id: number) => data(apiClient.get<WebhookDelivery[]>(`/partners/${id}/deliveries`)),
  retryDelivery: (deliveryId: number) => data(apiClient.post(`/partners/deliveries/${deliveryId}/retry`)),
};

// Partner API v1 ตามที่ระบบจองห้องพักเรียก (X-API-Key ไม่ใช้ JWT) — ใช้ในหน้า Partner Sandbox
const partnerApi = (apiKey: string) =>
  axios.create({ baseURL: `${API_URL}/partner/v1`, headers: { 'X-API-Key': apiKey } });

export const partnerApiClient = {
  createJob: (apiKey: string, body: PartnerJobRequest) =>
    partnerApi(apiKey).post<PartnerJobView>('/jobs', body).then((r) => ({ status: r.status, data: r.data })),
  getJob: (apiKey: string, externalRef: string) =>
    data(partnerApi(apiKey).get<PartnerJobView>(`/jobs/${encodeURIComponent(externalRef)}`)),
  cancelJob: (apiKey: string, externalRef: string) =>
    data(partnerApi(apiKey).post<PartnerJobView>(`/jobs/${encodeURIComponent(externalRef)}/cancel`, {})),
  inbox: () => data(axios.get<InboxEvent[]>(`${API_URL}/mock-partner/events`)),
};
