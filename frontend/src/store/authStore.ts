import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { User } from '../types/user';

interface AuthState {
  user: User | null;
  expiresAt: number | null;
  login: (user: User, expiresIn: number) => void;
  logout: () => void;
}

const AUTH_STORAGE_KEY = 'renocare-auth';

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
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ user, expiresAt }) => ({ user, expiresAt }),
    },
  ),
);

function isPersistedAuth(value: unknown): value is { state: Pick<AuthState, 'user' | 'expiresAt'> } {
  if (typeof value !== 'object' || value === null || !('state' in value)) return false;
  const state = value.state;
  if (typeof state !== 'object' || state === null || !('user' in state) || !('expiresAt' in state)) return false;
  const { user, expiresAt } = state;
  const validUser =
    user === null ||
    (typeof user === 'object' &&
      user !== null &&
      'userId' in user &&
      typeof user.userId === 'number' &&
      'email' in user &&
      typeof user.email === 'string' &&
      'fullName' in user &&
      typeof user.fullName === 'string' &&
      'role' in user &&
      (user.role === 'ADMIN' || user.role === 'USER' || user.role === 'TECHNICIAN'));
  return validUser && (expiresAt === null || (typeof expiresAt === 'number' && Number.isFinite(expiresAt)));
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== AUTH_STORAGE_KEY || !event.newValue) return;

    let persisted: unknown;
    try {
      persisted = JSON.parse(event.newValue);
    } catch (error) {
      console.error('Unable to sync authentication state from another tab.', error);
      return;
    }

    if (!isPersistedAuth(persisted)) {
      console.error('Unable to sync invalid authentication state from another tab.');
      return;
    }

    const { user, expiresAt } = persisted.state;
    const current = useAuthStore.getState();
    if (current.expiresAt !== expiresAt || JSON.stringify(current.user) !== JSON.stringify(user)) {
      useAuthStore.setState({ user, expiresAt });
    }
  });
}
