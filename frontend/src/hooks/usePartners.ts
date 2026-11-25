import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { partnerService } from '../services/partnerService';
import { jobKeys } from './useJobs';

export const partnerKeys = {
  all: ['partners'] as const,
  deliveries: (id: number) => ['partners', 'deliveries', id] as const,
  syncLogs: (id: number) => ['partners', 'syncLogs', id] as const,
};

export const usePartners = () => useQuery({ queryKey: partnerKeys.all, queryFn: partnerService.list });
export const useDeliveries = (partnerId: number | null) =>
  useQuery({
    queryKey: partnerKeys.deliveries(partnerId ?? 0),
    queryFn: () => partnerService.deliveries(partnerId!),
    enabled: !!partnerId,
    refetchInterval: 5000,
  });

export const usePartnerSyncLogs = (partnerId: number | null, enabled = true) =>
  useQuery({
    queryKey: partnerKeys.syncLogs(partnerId ?? 0),
    queryFn: () => partnerService.syncLogs(partnerId!),
    enabled: !!partnerId && enabled,
    refetchInterval: 10000,
  });

export function usePartnerMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: partnerKeys.all });
      qc.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}
