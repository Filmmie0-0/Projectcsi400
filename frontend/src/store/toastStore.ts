import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast { id: number; kind: ToastKind; message: string }

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++;
    // ข้อความเดิมที่ยังค้างอยู่ไม่ต้องซ้อน (เช่นกดปุ่มรัว ๆ)
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.message !== message), { id, kind, message }].slice(-4) }));
    setTimeout(() => get().dismiss(id), kind === 'error' ? 6000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// เรียกได้จากนอก React (เช่น MutationCache ใน main.tsx)
export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error: (m: string) => useToastStore.getState().push('error', m),
  info: (m: string) => useToastStore.getState().push('info', m),
};
