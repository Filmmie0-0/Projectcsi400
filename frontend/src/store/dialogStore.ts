import { create } from 'zustand';

// กล่องยืนยัน/กรอกข้อความในธีมเว็บ แทน window.confirm / window.prompt ของเบราว์เซอร์
export interface DialogOptions {
  title: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
  // มี input = โหมดกรอกข้อความ (คืน string), ไม่มี = โหมดยืนยัน (คืน '' เมื่อกดตกลง)
  input?: { label?: string; placeholder?: string; required?: boolean };
}

interface DialogState {
  current: (DialogOptions & { resolve: (v: string | null) => void }) | null;
  open: (o: DialogOptions) => Promise<string | null>;
  close: (v: string | null) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  current: null,
  open: (o) => new Promise((resolve) => {
    get().current?.resolve(null);
    set({ current: { ...o, resolve } });
  }),
  close: (v) => {
    get().current?.resolve(v);
    set({ current: null });
  },
}));

// await confirmDialog(...) → true/false
export const confirmDialog = (o: Omit<DialogOptions, 'input'>) =>
  useDialogStore.getState().open(o).then((v) => v !== null);

// await promptDialog(...) → ข้อความ หรือ null ถ้ากดยกเลิก
export const promptDialog = (o: Omit<DialogOptions, 'input'> & { input?: DialogOptions['input'] }) =>
  useDialogStore.getState().open({ ...o, input: o.input ?? {} });
