import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { partnerService } from '../../services/partnerService';
import { jobKeys } from '../../hooks/useJobs';
import { toast } from '../../store/toastStore';
import { formatDateTime } from '../../utils/formatDate';

const inboxKey = ['partners', 'inbox'] as const;

// กระดิ่งแจ้งเตือนงานซ่อมที่หอพักของเพื่อนส่งมา (job-service ดึงจาก Repair API v1 ทุก 1 นาที)
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const inbox = useQuery({ queryKey: inboxKey, queryFn: partnerService.inbox, refetchInterval: 30_000 });

  const syncNow = useMutation({
    mutationFn: partnerService.syncAll,
    onSuccess: (results) => {
      const failed = results.find((r) => r.error);
      if (failed) toast.error(failed.error!);
      else {
        const created = results.reduce((n, r) => n + (r.created ?? 0), 0);
        toast.success(created ? `ได้งานใหม่ ${created} งาน` : 'ไม่มีงานใหม่จากหอพัก');
      }
      qc.invalidateQueries({ queryKey: inboxKey });
      qc.invalidateQueries({ queryKey: jobKeys.all });
    },
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const jobs = inbox.data?.jobs ?? [];
  const partners = inbox.data?.partners ?? [];
  const syncError = partners.find((p) => p.lastSyncError)?.lastSyncError;
  const lastSynced = partners.map((p) => p.lastSyncedAt).filter(Boolean).sort().pop();

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="งานจากหอพัก"
        aria-label={`งานจากหอพักรอมอบหมาย ${jobs.length} งาน`}
        className="relative rounded-lg bg-sand-200 p-2 text-espresso-900 transition-colors hover:bg-sand-300"
      >
        <Bell className="h-5 w-5" />
        {jobs.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">
            {jobs.length > 99 ? '99+' : jobs.length}
          </span>
        )}
        {jobs.length === 0 && syncError && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-warning" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-line bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold">งานจากหอพักรอรับ</p>
              <p className="text-xs text-espresso-500">
                {partners.length ? `ซิงค์ล่าสุด ${formatDateTime(lastSynced)}` : 'ยังไม่ได้ตั้งค่าการเชื่อมต่อหอพัก'}
              </p>
            </div>
            <button
              onClick={() => syncNow.mutate()}
              disabled={syncNow.isPending || !partners.length}
              title="ดึงงานจากหอพักตอนนี้"
              className="rounded-md p-2 text-espresso-500 hover:bg-cream-200 hover:text-espresso-900 disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${syncNow.isPending ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {syncError && (
            <div className="flex gap-2 border-b border-line bg-warning-soft px-4 py-2 text-xs text-espresso-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>{syncError}</span>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto">
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-4 py-8 text-center text-sm text-espresso-500">
                <CheckCircle2 className="h-6 w-6 text-espresso-300" />
                ไม่มีงานใหม่รอมอบหมาย
              </div>
            ) : (
              jobs.map((j) => (
                <Link
                  key={j.jobId}
                  to={`/jobs/${j.jobId}`}
                  onClick={() => setOpen(false)}
                  className="block border-b border-line px-4 py-3 last:border-0 hover:bg-cream-100"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{j.title}</span>
                    {j.priority === 'URGENT' && (
                      <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">ด่วน</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-espresso-500">
                    {j.jobCode} · ห้อง {j.unitCode ?? '-'} · {formatDateTime(j.createdAt)}
                  </p>
                </Link>
              ))
            )}
          </div>

          <Link
            to="/jobs"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-2.5 text-center text-sm text-walnut-600 hover:bg-cream-100"
          >
            ดูงานทั้งหมด
          </Link>
        </div>
      )}
    </div>
  );
}
