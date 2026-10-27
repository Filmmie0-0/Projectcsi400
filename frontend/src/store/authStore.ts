import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { User } from '../types/user';

interface AuthState {
  user: User | null;
  expiresAt: number | null;
  login: (user: User, expiresIn: number) => void;
  logout: () => void;
}

// token อยู่ใน HttpOnly cookie (JS อ่านไม่ได้) — ที่นี่เก็บแค่ข้อมูลผู้ใช้และเวลาหมดอายุไว้แสดงผล
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      expiresAt: null,
      login: (user, expiresIn) => set({ user, expiresAt: Date.now() + expiresIn * 1000 }),
      logout: () => set({ user: null, expiresAt: null }),
    }),
    {
      name: 'renocare-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ user, expiresAt }) => ({ user, expiresAt }),
    },
  ),
);
