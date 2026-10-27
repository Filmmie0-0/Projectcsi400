import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryService } from '../services/inventoryService';

export const inventoryKeys = {
  all: ['inventory'] as const,
  materials: ['inventory', 'materials'] as const,
  movements: ['inventory', 'movements'] as const,
  requisitions: (params?: object) => ['inventory', 'requisitions', params ?? {}] as const,
  jobCost: (jobId: number) => ['inventory', 'job-cost', jobId] as const,
};

export const useMaterials = () => useQuery({ queryKey: inventoryKeys.materials, queryFn: () => inventoryService.listMaterials() });
export const useMovements = () => useQuery({ queryKey: inventoryKeys.movements, queryFn: () => inventoryService.movements() });
export const useRequisitions = (params?: { jobId?: number; status?: string }) =>
  useQuery({ queryKey: inventoryKeys.requisitions(params), queryFn: () => inventoryService.listRequisitions(params) });
export const useJobMaterialCost = (jobId: number, enabled: boolean) =>
  useQuery({ queryKey: inventoryKeys.jobCost(jobId), queryFn: () => inventoryService.jobCost(jobId), enabled });

// สต็อกกับใบเบิกกระทบกันเสมอ จึง invalidate ['inventory', ...] ทั้งหมด
export function useInventoryMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}
