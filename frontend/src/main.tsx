import React from 'react';
import ReactDOM from 'react-dom/client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import Toaster from './components/common/Toaster';
import DialogHost from './components/common/DialogHost';
import { errorMessage } from './services/apiError';
import { toast } from './store/toastStore';
import './index.css';

declare module '@tanstack/react-query' {
  interface Register {
    // ข้อความ toast ต่อ mutation: string หรือฟังก์ชันจาก argument; false = ไม่แจ้ง
    mutationMeta: { success?: string | false | ((vars: unknown) => string | false); silentError?: boolean };
  }
}

// แจ้งผลทุกปุ่มที่ทำรายการ (mutation) ในที่เดียว
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, vars, _ctx, mutation) => {
      const s = mutation.meta?.success;
      const msg = typeof s === 'function' ? s(vars) : s;
      if (msg !== false) toast.success(msg ?? 'บันทึกเรียบร้อย');
    },
    onError: (err, _vars, _ctx, mutation) => {
      if (!mutation.meta?.silentError) toast.error(errorMessage(err));
    },
  }),
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
      <DialogHost />
    </QueryClientProvider>
  </React.StrictMode>,
);
