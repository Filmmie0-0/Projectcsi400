import { useState } from 'react';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import { ErrorText } from '../../common/QueryState';
import { useJobMutation } from '../../../hooks/useJobs';
import { jobService } from '../../../services/jobService';
import { formatDate, todayIso } from '../../../utils/formatDate';
import type { JobDetail } from '../../../types/job';
import type { Role } from '../../../types/user';

// บันทึกงานรายวันของช่าง: ใช้ติดตามความคืบหน้า (และส่ง webhook job.progress ให้พาร์ทเนอร์)
export default function WorkLogSection({ job, role, userId }: { job: JobDetail; role: Role; userId: number }) {
  const canLog = role === 'TECHNICIAN' && job.status === 'IN_PROGRESS' && job.assignments.some((a) => a.technicianId === userId);
  const lastPct = job.workLogs[0]?.progressPct ?? 0;
  const [form, setForm] = useState({ workDate: todayIso(), hours: 8, progressPct: lastPct, note: '' });
  const add = useJobMutation(jobService.addWorkLog);

  if (!canLog && !job.workLogs.length) return null;
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">บันทึกงานรายวัน</h2>
        <span className="text-sm text-espresso-500">ความคืบหน้า {lastPct}%</span>
      </div>
      <div className="h-2 rounded-full bg-cream-200">
        <div className="h-2 rounded-full bg-walnut-400 transition-all" style={{ width: `${lastPct}%` }} />
      </div>

      {canLog && (
        <form
          className="grid gap-3 rounded-lg bg-cream-100 p-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate([job.jobId, form], { onSuccess: () => setForm({ ...form, note: '' }) });
          }}
        >
          <Input label="วันที่" type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} />
          <Input label="ชั่วโมง" type="number" min={0.5} max={24} step={0.5} value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
          <Input label="ความคืบหน้ารวม (%)" type="number" min={0} max={100} value={form.progressPct} onChange={(e) => setForm({ ...form, progressPct: Number(e.target.value) })} />
          <div className="sm:col-span-3">
            <Textarea label="ทำอะไรไปบ้าง" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <Button disabled={!form.note.trim() || add.isPending}>บันทึก</Button>
            <ErrorText error={add.error} />
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {job.workLogs.map((w) => (
          <li key={w.logId} className="flex gap-3 text-sm">
            <span className="w-20 shrink-0 text-espresso-500">{formatDate(w.workDate)}</span>
            <span className="flex-1">{w.note} <span className="text-xs text-espresso-500">— {w.technicianName}, {w.hours} ชม.</span></span>
            <span className="text-espresso-500">{w.progressPct}%</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
