import { apiClient, data } from './apiClient';
import type { Material, MaterialInput, Requisition, RequisitionInput, StockMovement } from '../types/inventory';

// inventory-service: /api/materials, /api/stock, /api/requisitions
export const inventoryService = {
  listMaterials: (q?: string) => data(apiClient.get<Material[]>('/materials', { params: { q } })),
  createMaterial: (body: MaterialInput) => data(apiClient.post<{ materialId: number }>('/materials', body)),
  updateMaterial: (id: number, body: Partial<MaterialInput> & { isActive?: boolean }) =>
    data(apiClient.patch(`/materials/${id}`, body)),

  stockIn: (body: { materialId: number; qty: number; unitCost?: number; note?: string }) => data(apiClient.post('/stock/in', body)),
  adjust: (body: { materialId: number; qty: number; note: string }) => data(apiClient.post('/stock/adjust', body)),
  movements: (materialId?: number) => data(apiClient.get<StockMovement[]>('/stock/movements', { params: { materialId } })),

  listRequisitions: (params?: { jobId?: number; status?: string }) =>
    data(apiClient.get<Requisition[]>('/requisitions', { params })),
  jobCost: (jobId: number) =>
    data(apiClient.get<{ jobId: number; requisitions: number; materialCost: number }>(`/requisitions/job-cost/${jobId}`)),
  createRequisition: (body: RequisitionInput) => data(apiClient.post<{ requisitionId: number; reqCode: string }>('/requisitions', body)),
  issue: (id: number, items: { itemId: number; qtyIssued: number }[]) => data(apiClient.post(`/requisitions/${id}/issue`, { items })),
  reject: (id: number, reason?: string) => data(apiClient.post(`/requisitions/${id}/reject`, { reason })),
  close: (id: number, items: { itemId: number; qtyReturned: number }[]) => data(apiClient.post(`/requisitions/${id}/close`, { items })),
};
