import { useState } from 'react';
import { Phone, RefreshCw } from 'lucide-react';
import Card from '../../ui/Card';
import Badge, { type Tone } from '../../ui/Badge';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import { ErrorText } from '../../common/QueryState';
import { useJobMutation } from '../../../hooks/useJobs';
import { jobService } from '../../../services/jobService';
import { promptDialog } from '../../../store/dialogStore';
import { formatDateTime } from '../../../utils/formatDate';
import type { JobDetail, OwnerApproval } from '../../../types/job';
import type { Role } from '../../../types/user';

const APPROVAL: Record<Exclude<OwnerApproval, 'NOT_REQUIRED'>, { label: string; tone: Tone }> = {
  PENDING: { label: 'รอเจ้าของหออนุมัติ', tone: 'warning' },
  APPROVED: { label: 'เจ้าของหออนุมัติแล้ว', tone: 'success' },
  REJECTED: { label: 'เจ้าของหอไม่อนุมัติ', tone: 'danger' },
};

// งานเปลี่ยนแปลงตัวอาคาร (STRUCTURAL): แอดมินโทรหาเจ้าของหอตามข้อมูลติดต่อ แล้วกดบันทึกผล
// ระบบพาร์ทเนอร์ส่งผลมาเองทาง API ได้เช่นกัน (POST /api/partner/v1/jobs/:ref/owner-approval)
export default function OwnerApprovalCard({ job, role }: { job: JobDetail; role: Role }) {
  const decide = useJobMutation(jobService.ownerDecision);
  const refresh = useJobMutation(jobService.refreshOwnerContact);
  const save = useJobMutation(jobService.saveOwnerContact);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ownerName: '', ownerPhone: '', ownerEmail: '' });

  if (job.workScope !== 'STRUCTURAL' || job.ownerApproval === 'NOT_REQUIRED') return null;
  const c = job.ownerContact;
  const isAdmin = role === 'ADMIN';
  const pending = job.ownerApproval === 'PENDING' && !['COMPLETED', 'CANCELLED'].includes(job.status);
  const hasContact = !!(c?.ownerName || c?.ownerPhone);

  const startEdit = () => {
    setForm({ ownerName: c?.ownerName ?? '', ownerPhone: c?.ownerPhone ?? '', ownerEmail: c?.ownerEmail ?? '' });
    setEditing(true);
  };

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">อนุมัติจากเจ้าของหอ</h2>
        <Badge tone={APPROVAL[job.ownerApproval].tone}>{APPROVAL[job.ownerApproval].label}</Badge>
      </div>
      <p className="text-sm text-espresso-500">
        งานนี้เปลี่ยนแปลงตัวอาคาร ต้องได้รับอนุมัติจากเจ้าของหอก่อนส่งสัญญาและเริ่มงาน
        {pending && isAdmin && ' — โทรสอบถามเจ้าของหอแล้วบันทึกผลด้านล่าง'}
      </p>

      {isAdmin && (
        <div className="rounded-lg bg-cream-100 p-3 text-sm">
          {hasContact && !editing ? (
            <>
              <p className="font-medium">{c!.ownerName ?? '-'}</p>
              {c!.ownerPhone && (
                <a href={`tel:${c!.ownerPhone}`} className="inline-flex items-center gap-1 text-walnut-600 hover:underline">
                  <Phone className="h-3.5 w-3.5" /> {c!.ownerPhone}
                </a>
              )}
              {c!.ownerEmail && <p className="text-espresso-500">{c!.ownerEmail}</p>}
            </>
          ) : !editing ? (
            <p className="text-espresso-500">
              ยังไม่มีข้อมูลติดต่อเจ้าของหอ{c?.fetchError ? ` (ขอจากระบบพาร์ทเนอร์ไม่สำเร็จ: ${c.fetchError})` : ''}
            </p>
          ) : null}

          {editing && (
            <div className="space-y-2">
              <Input label="ชื่อเจ้าของหอ" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
              <Input label="เบอร์โทร" value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} />
              <Input label="อีเมล (ไม่บังคับ)" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
              <div className="flex gap-2">
                <Button
                  onClick={() => save.mutate([job.jobId, { ...form, ownerEmail: form.ownerEmail || undefined }], { onSuccess: () => setEditing(false) })}
                  disabled={save.isPending}
                >
                  บันทึก
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>ยกเลิก</Button>
              </div>
            </div>
          )}

          {pending && !editing && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <button type="button" className="text-walnut-600 hover:underline" onClick={startEdit}>
                {hasContact ? 'แก้ข้อมูลติดต่อ' : 'กรอกข้อมูลติดต่อเอง'}
              </button>
              {job.partnerId && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-walnut-600 hover:underline disabled:opacity-50"
                  onClick={() => refresh.mutate([job.jobId])}
                  disabled={refresh.isPending}
                >
                  <RefreshCw className="h-3 w-3" /> ขอข้อมูลจาก {job.partnerName ?? 'พาร์ทเนอร์'} อีกครั้ง
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isAdmin && pending && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              const note = await promptDialog({
                title: 'เจ้าของหออนุมัติ',
                input: { label: 'บันทึกเพิ่มเติม', placeholder: 'เช่น โทรคุยกับใคร เมื่อไหร่' },
                confirmText: 'บันทึกว่าอนุมัติ',
              });
              if (note !== null) decide.mutate([job.jobId, 'APPROVED', note || undefined]);
            }}
            disabled={decide.isPending}
          >
            เจ้าของหออนุมัติ
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const note = await promptDialog({
                title: 'เจ้าของหอไม่อนุมัติ',
                message: 'งานนี้จะถูกยกเลิก',
                input: { label: 'เหตุผลที่ไม่อนุมัติ' },
                confirmText: 'ไม่อนุมัติและยกเลิกงาน',
                danger: true,
              });
              if (note !== null) decide.mutate([job.jobId, 'REJECTED', note || undefined]);
            }}
            disabled={decide.isPending}
          >
            ไม่อนุมัติ
          </Button>
        </div>
      )}

      {c?.decidedAt && (
        <p className="text-xs text-espresso-500">
          บันทึกผลเมื่อ {formatDateTime(c.decidedAt)}{c.decisionNote ? ` · ${c.decisionNote}` : ''}
        </p>
      )}
      <ErrorText error={decide.error ?? refresh.error ?? save.error} />
    </Card>
  );
}
