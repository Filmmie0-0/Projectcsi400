import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { User } from '../types/user';

interface AuthState {
  user: User | null;
  expiresAt: number | null;
  login: (user: User, expiresIn: number) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      expiresAt: null,
      login: (user, expiresIn) => set({ user, expiresAt: Date.now() + expiresIn * 1000 }),
      logout: () => set({ user: null, expiresAt: null }),
    }),
    {
      name: 'mfc-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ user, expiresAt }) => ({ user, expiresAt }),
    },
  ),
);
