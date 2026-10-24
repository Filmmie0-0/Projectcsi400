import { apiClient } from './apiClient';
import { USE_MOCK } from './config';
import { mockDb } from './mock/mockDb';
import type { Category, ProductInput, Store, StoreProduct, StoreUpdate } from '../types/store';

type ProductPatch = Partial<Pick<StoreProduct, 'name' | 'sellingPrice' | 'categoryId' | 'tiers'>>;

// ร้านค้าของผู้เช่าที่ล็อกอินอยู่ (/tenant/store/*)
const api = {
  getStore: () => apiClient.get<Store>('/tenant/store').then((r) => r.data),
  updateStore: (body: StoreUpdate) => apiClient.put<Store>('/tenant/store', body).then((r) => r.data),
  listCategories: () => apiClient.get<Category[]>('/tenant/store/categories').then((r) => r.data),
  addCategory: (name: string) => apiClient.post<Category>('/tenant/store/categories', { name }).then((r) => r.data),
  removeCategory: (id: number) => apiClient.delete(`/tenant/store/categories/${id}`).then(() => null),
  listProducts: () => apiClient.get<StoreProduct[]>('/tenant/store/products').then((r) => r.data),
  addProduct: (body: ProductInput) => apiClient.post<StoreProduct>('/tenant/store/products', body).then((r) => r.data),
  updateProduct: (id: number, body: ProductPatch) =>
    apiClient.patch<StoreProduct>(`/tenant/store/products/${id}`, body).then((r) => r.data),
  deleteProduct: (id: number) => apiClient.delete(`/tenant/store/products/${id}`).then(() => null),
  adjustStock: (id: number, delta: number) =>
    apiClient.post<StoreProduct>(`/tenant/store/products/${id}/adjust`, { delta }).then((r) => r.data),
  applyPreset: (presetId: string) =>
    apiClient.post<{ added: number; skipped: number }>('/tenant/store/presets', { presetId }).then((r) => r.data),
};

export const storeService: typeof api = USE_MOCK
  ? {
      getStore: mockDb.getStore,
      updateStore: mockDb.updateStore,
      listCategories: mockDb.listCategories,
      addCategory: mockDb.addCategory,
      removeCategory: mockDb.removeCategory,
      listProducts: mockDb.listProducts,
      addProduct: mockDb.addProduct,
      updateProduct: mockDb.updateProduct,
      deleteProduct: mockDb.deleteProduct,
      adjustStock: mockDb.adjustStock,
      applyPreset: mockDb.applyPreset,
    }
  : api;
