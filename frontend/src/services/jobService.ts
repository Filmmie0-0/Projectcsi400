import { apiClient, data } from './apiClient';
import type {
  AdminSummary, Building, Contract, ContractInput, Invoice, JobDetail, JobListItem, SurveyInput, WorkLogInput,
} from '../types/job';

// job-service: /api/buildings, /api/jobs, /api/contracts, /api/invoices
export const jobService = {
  listBuildings: () => data(apiClient.get<Building[]>('/buildings')),

  listJobs: (params?: { status?: string; type?: string }) => data(apiClient.get<JobListItem[]>('/jobs', { params })),
  getJob: (id: number) => data(apiClient.get<JobDetail>(`/jobs/${id}`)),
  assign: (id: number, body: { technicianIds: number[]; leadId: number; scheduledDate?: string }) =>
    data(apiClient.post<JobDetail>(`/jobs/${id}/assign`, body)),
  submitSurvey: (id: number, body: SurveyInput) => data(apiClient.post<JobDetail>(`/jobs/${id}/surveys`, body)),
  start: (id: number) => data(apiClient.post<JobDetail>(`/jobs/${id}/start`)),
  addWorkLog: (id: number, body: WorkLogInput) => data(apiClient.post<JobDetail>(`/jobs/${id}/work-logs`, body)),
  complete: (id: number, remark?: string) => data(apiClient.post<JobDetail>(`/jobs/${id}/complete`, { remark })),
  cancel: (id: number, reason?: string) => data(apiClient.post<JobDetail>(`/jobs/${id}/cancel`, { reason })),

  // งาน STRUCTURAL: แอดมินโทรถามเจ้าของหอแล้วบันทึกผล
  ownerDecision: (id: number, decision: 'APPROVED' | 'REJECTED', note?: string) =>
    data(apiClient.post<JobDetail>(`/jobs/${id}/owner-approval`, { decision, note })),
  refreshOwnerContact: (id: number) => data(apiClient.post<JobDetail>(`/jobs/${id}/owner-contact/refresh`)),
  saveOwnerContact: (id: number, body: { ownerName: string; ownerPhone: string; ownerEmail?: string }) =>
    data(apiClient.put<JobDetail>(`/jobs/${id}/owner-contact`, body)),

  listContracts: () => data(apiClient.get<Contract[]>('/contracts')),
  createContract: (body: ContractInput) => data(apiClient.post<{ contractId: number }>('/contracts', body)),
  deleteContract: (id: number) => apiClient.delete(`/contracts/${id}`).then(() => null),
  sendContract: (id: number) => data(apiClient.post<JobDetail>(`/contracts/${id}/send`)),
  // ไฟล์ส่งเป็น binary ตรง ๆ: Content-Type = ชนิดไฟล์, ชื่อไฟล์อยู่ใน ?name=
  uploadContractFile: (id: number, file: File) =>
    data(apiClient.post<JobDetail>(`/contracts/${id}/files`, file, { params: { name: file.name }, headers: { 'Content-Type': file.type } })),
  deleteContractFile: (id: number, fileId: number) => data(apiClient.delete<JobDetail>(`/contracts/${id}/files/${fileId}`)),
  getContractFile: (id: number, fileId: number) =>
    data(apiClient.get<Blob>(`/contracts/${id}/files/${fileId}`, { responseType: 'blob' })),
  signContract: (id: number, signedFile: File) =>
    data(apiClient.post<JobDetail>(`/contracts/${id}/sign`, signedFile, { params: { name: signedFile.name }, headers: { 'Content-Type': signedFile.type } })),
  rejectContract: (id: number, reason?: string) => data(apiClient.post<JobDetail>(`/contracts/${id}/reject`, { reason })),

  listInvoices: (status?: string) => data(apiClient.get<Invoice[]>('/invoices', { params: { status } })),
  payInvoice: (id: number, slipRef: string) => data(apiClient.post(`/invoices/${id}/pay`, { slipRef })),
  verifyInvoice: (id: number, approve: boolean) => data(apiClient.post(`/invoices/${id}/verify`, { approve })),

  // gateway รวมจาก 3 service
  adminSummary: () => data(apiClient.get<AdminSummary>('/admin/summary')),
};
