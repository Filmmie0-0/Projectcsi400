import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jobService } from '../services/jobService';
import type { JobDetail } from '../types/job';

export const jobKeys = {
  all: ['jobs'] as const,
  list: (params?: object) => ['jobs', 'list', params ?? {}] as const,
  detail: (id: number) => ['jobs', 'detail', id] as const,
  buildings: ['jobs', 'buildings'] as const,
  contracts: ['jobs', 'contracts'] as const,
  invoices: ['jobs', 'invoices'] as const,
  summary: ['jobs', 'summary'] as const,
};

export const useJobs = (params?: { status?: string; type?: string }) =>
  useQuery({ queryKey: jobKeys.list(params), queryFn: () => jobService.listJobs(params) });
export const useJob = (id: number) =>
  useQuery({ queryKey: jobKeys.detail(id), queryFn: () => jobService.getJob(id), enabled: id > 0 });
export const useBuildings = () => useQuery({ queryKey: jobKeys.buildings, queryFn: jobService.listBuildings });
export const useContracts = () => useQuery({ queryKey: jobKeys.contracts, queryFn: jobService.listContracts });
export const useInvoices = () => useQuery({ queryKey: jobKeys.invoices, queryFn: () => jobService.listInvoices() });
export const useAdminSummary = () => useQuery({ queryKey: jobKeys.summary, queryFn: jobService.adminSummary });

// ทุก action ของงานกระทบหลายหน้าจอ (รายการ/สัญญา/บิล) จึง invalidate ['jobs', ...] ทั้งหมด
// action ที่คืน JobDetail ใส่ลง cache ของหน้ารายละเอียดทันที
export function useJobMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: (result) => {
      const job = result as Partial<JobDetail> | null;
      if (job && typeof job === 'object' && 'jobId' in job && 'statusLogs' in job) {
        qc.setQueryData(jobKeys.detail(job.jobId as number), job);
      }
      return qc.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}
