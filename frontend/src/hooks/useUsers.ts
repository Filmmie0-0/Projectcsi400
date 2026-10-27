import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/authService';
import type { Role, User, UserInput } from '../types/user';

export const userKeys = { list: (role?: Role) => ['users', role ?? 'all'] as const };

export const useUsers = (role?: Role) => useQuery({ queryKey: userKeys.list(role), queryFn: () => authService.listUsers(role) });
export const useTechnicians = () => useUsers('TECHNICIAN');

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserInput) => authService.createUser(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Pick<User, 'status' | 'skills' | 'dailyWage'>>) =>
      authService.updateUser(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
