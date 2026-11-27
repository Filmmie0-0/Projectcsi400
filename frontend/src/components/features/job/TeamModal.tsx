import { useState } from 'react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import { ErrorText } from '../../common/QueryState';
import { useActiveTechnicians } from '../../../hooks/useUsers';
import { useJobMutation } from '../../../hooks/useJobs';
import { jobService } from '../../../services/jobService';
import type { JobDetail } from '../../../types/job';

// หัวหน้าช่างเลือกลูกมือ / ช่างคนอื่นเข้าทีม (ไม่เลือกใคร = ทำคนเดียว)
export default function TeamModal({ job, leadId, open, onClose }: { job: JobDetail; leadId: number; open: boolean; onClose: () => void }) {
  const techs = useActiveTechnicians();
  const [selected, setSelected] = useState<number[]>(job.assignments.filter((a) => !a.isLead).map((a) => a.technicianId));
  const save = useJobMutation(jobService.setTeam);

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เลือกลูกทีมช่าง"
      footer={<Button onClick={() => save.mutate([job.jobId, selected], { onSuccess: onClose })} disabled={save.isPending}>บันทึก</Button>}
    >
      <div className="space-y-4">
        <p className="text-xs text-espresso-500">เลือกลูกมือหรือช่างคนอื่นที่จะทำงานนี้ด้วยกัน</p>
        <div className="space-y-2">
          {(techs.data ?? []).filter((t) => t.userId !== leadId).map((t) => (
            <label key={t.userId} className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm hover:bg-cream-50">
              <input type="checkbox" checked={selected.includes(t.userId)} onChange={() => toggle(t.userId)} />
              <div className="flex-1">
                <p className="font-medium">{t.fullName}</p>
                <p className="text-xs text-espresso-500">{t.skills || '-'}{t.phone ? ` · ${t.phone}` : ''}</p>
              </div>
            </label>
          ))}
        </div>
        <ErrorText error={techs.error ?? save.error} />
      </div>
    </Modal>
  );
}
