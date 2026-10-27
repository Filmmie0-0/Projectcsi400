import { apiClient, data } from './apiClient';
import type {
  AdminSummary, Building, Contract, ContractInput, Invoice, JobDetail, JobInput, JobListItem, SurveyInput, UnitInput, WorkLogInput,
} from '../types/job';

// job-service: /api/buildings, /api/jobs, /api/contracts, /api/invoices
export const jobService = {
  listBuildings: () => data(apiClient.get<Building[]>('/buildings')),
  createBuilding: (body: { name: string; address: string; units: UnitInput[] }) =>
    data(apiClient.post<{ buildingId: number }>('/buildings', body)),
  addUnit: (buildingId: number, body: UnitInput) => data(apiClient.post<{ unitId: number }>(`/buildings/${buildingId}/units`, body)),

  listJobs: (params?: { status?: string; type?: string }) => data(apiClient.get<JobListItem[]>('/jobs', { params })),
  getJob: (id: number) => data(apiClient.get<JobDetail>(`/jobs/${id}`)),
  createJob: (body: JobInput) => data(apiClient.post<{ jobId: number; jobCode: string }>('/jobs', body)),
  assign: (id: number, body: { technicianIds: number[]; leadId: number; scheduledDate?: string }) =>
    data(apiClient.post<JobDetail>(`/jobs/${id}/assign`, body)),
  submitSurvey: (id: number, body: SurveyInput) => data(apiClient.post<JobDetail>(`/jobs/${id}/surveys`, body)),
  start: (id: number) => data(apiClient.post<JobDetail>(`/jobs/${id}/start`)),
  addWorkLog: (id: number, body: WorkLogInput) => data(apiClient.post<JobDetail>(`/jobs/${id}/work-logs`, body)),
  complete: (id: number, remark?: string) => data(apiClient.post<JobDetail>(`/jobs/${id}/complete`, { remark })),
  cancel: (id: number, reason?: string) => data(apiClient.post<JobDetail>(`/jobs/${id}/cancel`, { reason })),

  listContracts: () => data(apiClient.get<Contract[]>('/contracts')),
  createContract: (body: ContractInput) => data(apiClient.post<{ contractId: number }>('/contracts', body)),
  deleteContract: (id: number) => apiClient.delete(`/contracts/${id}`).then(() => null),
  sendContract: (id: number) => data(apiClient.post<JobDetail>(`/contracts/${id}/send`)),
  signContract: (id: number, signedName: string) => data(apiClient.post<JobDetail>(`/contracts/${id}/sign`, { signedName })),
  rejectContract: (id: number, reason?: string) => data(apiClient.post<JobDetail>(`/contracts/${id}/reject`, { reason })),

  listInvoices: (status?: string) => data(apiClient.get<Invoice[]>('/invoices', { params: { status } })),
  payInvoice: (id: number, slipRef: string) => data(apiClient.post(`/invoices/${id}/pay`, { slipRef })),
  verifyInvoice: (id: number, approve: boolean) => data(apiClient.post(`/invoices/${id}/verify`, { approve })),

  // gateway รวมจาก 3 service
  adminSummary: () => data(apiClient.get<AdminSummary>('/admin/summary')),
};
