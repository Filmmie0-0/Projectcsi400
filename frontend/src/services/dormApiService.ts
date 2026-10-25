import axios from 'axios';
import { USE_MOCK } from './config';
import { mockDb } from './mock/mockDb';
import { toApiError } from './apiError';
import type { ApiError, CreateOrderRequest, ExternalOrder, StoreCatalog } from '../types/order';

// Client ของ Open API (/open/v1) แบบที่ระบบหอพักภายนอกใช้: ยืนยันตัวตนด้วย X-API-Key ไม่ใช่ JWT ของผู้ใช้
const openApi = axios.create({ baseURL: `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'}/open/v1` });

export interface ApiCall<T> {
  method: 'GET' | 'POST';
  path: string;
  requestBody?: unknown;
  status: number;
  durationMs: number;
  data?: T;
  error?: ApiError;
}

async function call<T>(
  method: ApiCall<T>['method'],
  path: string,
  apiKey: string,
  requestBody: unknown,
  mock: () => Promise<T>,
): Promise<ApiCall<T>> {
  const started = performance.now();
  try {
    const data = USE_MOCK
      ? await mock()
      : (await openApi.request<T>({ method, url: path, data: requestBody, headers: { 'X-API-Key': apiKey } })).data;
    return { method, path, requestBody, status: method === 'POST' ? 201 : 200, durationMs: performance.now() - started, data };
  } catch (err) {
    const error = toApiError(err);
    return { method, path, requestBody, status: error.status, durationMs: performance.now() - started, error };
  }
}

export const dormApiService = {
  getCatalog: (apiKey: string, storeId: number) =>
    call<StoreCatalog>('GET', `/stores/${storeId}/products`, apiKey, undefined, () => mockDb.getCatalog(apiKey, storeId)),
  createOrder: (apiKey: string, body: CreateOrderRequest) =>
    call<ExternalOrder>('POST', '/orders', apiKey, body, () => mockDb.createOrder(apiKey, body)),
  listOrders: (apiKey: string, storeId: number) =>
    call<ExternalOrder[]>('GET', `/stores/${storeId}/orders`, apiKey, undefined, () => mockDb.listOrders(apiKey, storeId)),
};
