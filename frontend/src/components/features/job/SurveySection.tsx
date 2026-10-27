import { useState } from 'react';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import SurveyFormModal from './SurveyFormModal';
import { ACTION, CONDITION } from '../../../constants/labels';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDate, formatDateTime } from '../../../utils/formatDate';
import type { JobDetail } from '../../../types/job';
import type { Role } from '../../../types/user';

export default function SurveySection({ job, role, userId }: { job: JobDetail; role: Role; userId: number }) {
  const [open, setOpen] = useState(false);
  const assigned = job.assignments.some((a) => a.technicianId === userId);
  const canSubmitInitial = role === 'TECHNICIAN' && assigned && job.status === 'SURVEY_ASSIGNED';
  const canReportExtra = role === 'TECHNICIAN' && assigned && ['CONTRACTED', 'IN_PROGRESS'].includes(job.status);

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">ประเมินหน้างาน / ผลตรวจ</h2>
        {canSubmitInitial && <Button onClick={() => setOpen(true)}>บันทึกผลประเมิน</Button>}
        {canReportExtra && <Button variant="secondary" onClick={() => setOpen(true)}>แจ้งงานเพิ่ม</Button>}
      </div>
      {!job.surveys.length && <p className="text-sm text-espresso-500">ยังไม่ได้นัดประเมินหน้างาน</p>}
      {job.surveys.map((s) => (
        <div key={s.surveyId} className="rounded-lg border border-line p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={s.surveyType === 'INITIAL' ? 'brand' : 'warning'}>{s.surveyType === 'INITIAL' ? 'ประเมินครั้งแรก' : 'งานเพิ่มเติม'}</Badge>
            {s.status === 'SCHEDULED'
              ? <span className="text-espresso-500">นัดวันที่ {formatDate(s.scheduledDate)}</span>
              : <span className="text-espresso-500">ส่งผล {formatDateTime(s.submittedAt)} · ประเมิน {s.estDays} วัน</span>}
            {s.needRepair === 0 && <Badge tone="success">ไม่ต้องซ่อม</Badge>}
          </div>
          {s.summary && <p className="mt-2 text-sm">{s.summary}</p>}
          {s.items.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <tbody>
                {s.items.map((i) => (
                  <tr key={i.itemId} className="border-t border-line/60">
                    <td className="py-1.5 text-espresso-500">{i.area}</td>
                    <td>{i.item}{i.note && <span className="text-xs text-espresso-500"> — {i.note}</span>}</td>
                    <td><Badge tone={CONDITION[i.itemCondition].tone}>{CONDITION[i.itemCondition].label}</Badge></td>
                    <td className="text-espresso-500">{ACTION[i.action]}</td>
                    <td className="text-right">{i.estCost > 0 ? formatCurrency(i.estCost) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      {open && <SurveyFormModal job={job} open={open} onClose={() => setOpen(false)} />}
    </Card>
  );
}
