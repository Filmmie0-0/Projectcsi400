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

// แอดมินเลือกแค่หัวหน้าช่าง (+ วันเวลานัดถ้าเป็นงานใหม่) — หัวหน้าช่างเลือกลูกทีมเองใน TeamModal
export default function AssignTechnicianModal({ job, open, onClose }: { job: JobDetail; open: boolean; onClose: () => void }) {
  const techs = useTechnicians();
  const [leadId, setLeadId] = useState<number | null>(job.assignments.find((a) => a.isLead)?.technicianId ?? null);
  const [date, setDate] = useState(job.preferredDate ?? '');
  const [time, setTime] = useState(defaultTimeForJob(job));
  const [note, setNote] = useState('');
  const assign = useJobMutation(jobService.assign);
  const isNew = job.status === 'NEW';

  const submit = () =>
    assign.mutate(
      [
        job.jobId,
        {
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
      title={isNew ? 'เลือกหัวหน้าช่างและนัดเข้าหน้างาน' : 'เปลี่ยนหัวหน้าช่าง'}
      footer={<Button onClick={submit} disabled={!leadId || (isNew && !date) || assign.isPending}>บันทึก</Button>}
    >
      <div className="space-y-4">
        <p className="text-xs text-espresso-500">หัวหน้าช่างจะเป็นคนประเมินหน้างานและเลือกลูกทีมเอง</p>
        <div className="space-y-2">
          {(techs.data ?? []).filter((t) => t.status === 'ACTIVE').map((t) => (
            <label key={t.userId} className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm hover:bg-cream-50">
              <input
                type="checkbox"
                checked={leadId === t.userId}
                onChange={() => setLeadId(leadId === t.userId ? null : t.userId)}
              />
              <div className="flex-1">
                <p className="font-medium">{t.fullName}</p>
                <p className="text-xs text-espresso-500">{t.skills} · ค่าแรง {formatCurrency(t.dailyWage ?? 0)}/วัน</p>
              </div>
              {leadId === t.userId && <span className="text-xs font-medium">หัวหน้า</span>}
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
