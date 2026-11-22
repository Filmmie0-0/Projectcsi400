import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToastStore, type ToastKind } from '../../store/toastStore';

const STYLE: Record<ToastKind, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: 'border-success/30 bg-success-soft text-success' },
  error: { icon: XCircle, className: 'border-danger/30 bg-danger-soft text-danger' },
  info: { icon: Info, className: 'border-line bg-white text-espresso-700' },
};

// แจ้งเตือนมุมขวาบน หายเองใน 3–6 วินาที หรือกด × ปิด
export default function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:w-96" aria-live="polite">
      {toasts.map((t) => {
        const { icon: Icon, className } = STYLE[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg animate-[toast-in_.2s_ease-out] ${className}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1 text-espresso-900">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="ปิด" className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
