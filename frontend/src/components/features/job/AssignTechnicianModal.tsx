import { useState } from 'react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import { ErrorText } from '../../common/QueryState';
import { useTechnicians } from '../../../hooks/useUsers';
import { useJobMutation } from '../../../hooks/useJobs';
import { jobService } from '../../../services/jobService';
import { formatCurrency } from '../../../utils/formatCurrency';
import type { JobDetail } from '../../../types/job';

function defaultTimeForJob(job: JobDetail) {
  const pref = String(job.remotePayload?.preferred_time ?? '').toLowerCase();
  if (pref === 'afternoon') return '13:00';
  if (pref === 'evening') return '17:00';
  return '09:00';
}

// งานใหม่: เลือกทีมช่าง + หัวหน้าช่าง (คนประเมินหน้างาน) + วันเวลานัด  |  งานที่เดินแล้ว: ปรับทีมช่าง
export default function AssignTechnicianModal({ job, open, onClose }: { job: JobDetail; open: boolean; onClose: () => void }) {
  const techs = useTechnicians();
  const [selected, setSelected] = useState<number[]>(job.assignments.map((a) => a.technicianId));
  const [leadId, setLeadId] = useState<number | null>(job.assignments.find((a) => a.isLead)?.technicianId ?? null);
  const [date, setDate] = useState(job.preferredDate ?? '');
  const [time, setTime] = useState(defaultTimeForJob(job));
  const [note, setNote] = useState('');
  const assign = useJobMutation(jobService.assign);
  const isNew = job.status === 'NEW';

  const toggle = (id: number) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    if (!next.includes(leadId ?? -1)) setLeadId(next[0] ?? null);
  };

  const submit = () =>
    assign.mutate(
      [
        job.jobId,
        {
          technicianIds: selected,
          leadId: leadId!,
          scheduledDate: isNew ? date : undefined,
          scheduledTime: isNew ? time : undefined,
          note: note.trim() || undefined,
        },
      ],
      { onSuccess: onClose },
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? 'มอบหมายช่างและนัดเข้าหน้างาน' : 'ปรับทีมช่าง'}
      footer={<Button onClick={submit} disabled={!leadId || (isNew && !date) || assign.isPending}>บันทึก</Button>}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {(techs.data ?? []).filter((t) => t.status === 'ACTIVE').map((t) => (
            <label key={t.userId} className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm hover:bg-cream-50">
              <input type="checkbox" checked={selected.includes(t.userId)} onChange={() => toggle(t.userId)} />
              <div className="flex-1">
                <p className="font-medium">{t.fullName}</p>
                <p className="text-xs text-espresso-500">{t.skills} · ค่าแรง {formatCurrency(t.dailyWage ?? 0)}/วัน</p>
              </div>
              {selected.includes(t.userId) && (
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" name="lead" checked={leadId === t.userId} onChange={() => setLeadId(t.userId)} /> หัวหน้า
                </label>
              )}
            </label>
          ))}
        </div>
        {isNew && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="วันนัดเข้าหน้างาน" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label="เวลานัด (ส่งให้หอพัก)" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        )}
        {isNew && job.remoteJobId && (
          <Textarea
            label="หมายเหตุถึงหอพัก (ไม่บังคับ)"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น นำน้ำยาแอร์ไปด้วย"
          />
        )}
        <ErrorText error={techs.error ?? assign.error} />
      </div>
    </Modal>
  );
}
