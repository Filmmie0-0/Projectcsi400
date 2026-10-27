import { useState } from 'react';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import StatusBadge from '../../common/StatusBadge';
import { ErrorText } from '../../common/QueryState';
import ContractFormModal from './ContractFormModal';
import { BILLING_TYPE } from '../../../constants/labels';
import { useJobMutation } from '../../../hooks/useJobs';
import { jobService } from '../../../services/jobService';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDate, formatDateTime } from '../../../utils/formatDate';
import type { Contract, JobDetail, Survey } from '../../../types/job';
import type { Role } from '../../../types/user';

export default function ContractSection({ job, role }: { job: JobDetail; role: Role }) {
  const [draftFor, setDraftFor] = useState<Survey | null>(null);

  // ผลประเมินที่ยังไม่มีสัญญาที่ใช้งานอยู่ = ร่างสัญญาได้
  const hasActive = (s: Survey) => job.contracts.some((c) => c.surveyId === s.surveyId && ['DRAFT', 'SENT', 'SIGNED'].includes(c.status));
  const draftable = role === 'ADMIN'
    ? job.surveys.filter((s) => s.status === 'SUBMITTED' && s.needRepair !== 0 && !hasActive(s) && (
        (s.surveyType === 'INITIAL' && job.status === 'SURVEYED') ||
        (s.surveyType === 'ADDITIONAL' && ['CONTRACTED', 'IN_PROGRESS'].includes(job.status))))
    : [];
  const visible = role === 'USER' ? job.contracts.filter((c) => c.status !== 'DRAFT') : job.contracts;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">สัญญา & งวดชำระ</h2>
        {draftable.map((s) => (
          <Button key={s.surveyId} onClick={() => setDraftFor(s)}>
            {s.surveyType === 'INITIAL' ? 'ร่างสัญญาหลัก' : 'ร่างสัญญาเพิ่มเติม'}
          </Button>
        ))}
      </div>
      {!visible.length && <p className="text-sm text-espresso-500">ยังไม่มีสัญญา</p>}
      {visible.map((c) => <ContractCard key={c.contractId} contract={c} role={role} />)}
      {draftFor && <ContractFormModal job={job} survey={draftFor} open onClose={() => setDraftFor(null)} />}
    </Card>
  );
}

function ContractCard({ contract: c, role }: { contract: Contract; role: Role }) {
  const send = useJobMutation(jobService.sendContract);
  const remove = useJobMutation(jobService.deleteContract);
  const sign = useJobMutation(jobService.signContract);
  const reject = useJobMutation(jobService.rejectContract);
  const [signing, setSigning] = useState(false);
  const [signedName, setSignedName] = useState('');
  const error = send.error ?? remove.error ?? sign.error ?? reject.error;

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium">{c.contractNo}</span>
        <Badge tone={c.contractType === 'MAIN' ? 'brand' : 'warning'}>{c.contractType === 'MAIN' ? 'สัญญาหลัก' : 'สัญญาเพิ่มเติม'}</Badge>
        <Badge>{BILLING_TYPE[c.billingType].label}</Badge>
        <StatusBadge kind="contract" status={c.status} />
        <span className="ml-auto text-lg font-semibold">{formatCurrency(c.totalAmount)}</span>
      </div>
      <p className="mt-2 text-sm text-espresso-500">
        {formatDate(c.startDate)} – {formatDate(c.endDate)} · ค่าแรง {formatCurrency(c.rate)} × {c.periodQty} {BILLING_TYPE[c.billingType].unit}
        {' '}= {formatCurrency(c.laborAmount)} · ค่าวัสดุ {formatCurrency(c.materialAmount)}
      </p>
      {c.terms && <p className="mt-1 text-sm">{c.terms}</p>}
      {!!c.items?.length && (
        <ul className="mt-2 space-y-0.5 text-sm text-espresso-700">
          {c.items.map((i) => (
            <li key={i.itemId} className="flex justify-between"><span>• {i.description} × {i.qty} {i.unit}</span><span>{formatCurrency(i.lineTotal ?? 0)}</span></li>
          ))}
        </ul>
      )}
      {c.signedAt && <p className="mt-2 text-xs text-success">ลงนามโดย {c.signedName} เมื่อ {formatDateTime(c.signedAt)}</p>}
      {c.rejectReason && <p className="mt-2 text-xs text-danger">เหตุผลที่ปฏิเสธ: {c.rejectReason}</p>}

      {!!c.invoices?.length && (
        <div className="mt-3 space-y-1 border-t border-line pt-3">
          {c.invoices.map((v) => (
            <div key={v.invoiceId} className="flex items-center justify-between text-sm">
              <span>{v.description} <span className="text-xs text-espresso-500">(ครบกำหนด {formatDate(v.dueDate)})</span></span>
              <span className="flex items-center gap-2">{formatCurrency(v.amount)} <StatusBadge kind="invoice" status={v.status} /></span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {role === 'ADMIN' && c.status === 'DRAFT' && (
          <>
            <Button onClick={() => send.mutate([c.contractId])} disabled={send.isPending}>ส่งให้ลูกค้า</Button>
            <Button variant="ghost" onClick={() => remove.mutate([c.contractId])} disabled={remove.isPending}>ลบร่าง</Button>
          </>
        )}
        {role === 'USER' && c.status === 'SENT' && (
          <>
            <Button onClick={() => setSigning(true)}>ลงนามสัญญา</Button>
            <Button
              variant="ghost"
              onClick={() => {
                const reason = window.prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ)');
                if (reason !== null) reject.mutate([c.contractId, reason]);
              }}
            >
              ปฏิเสธ
            </Button>
          </>
        )}
      </div>
      <ErrorText error={error} />

      <Modal
        open={signing}
        onClose={() => setSigning(false)}
        title={`ลงนามสัญญา ${c.contractNo}`}
        footer={
          <Button disabled={!signedName.trim() || sign.isPending} onClick={() => sign.mutate([c.contractId, signedName], { onSuccess: () => setSigning(false) })}>
            ยืนยันลงนาม
          </Button>
        }
      >
        <p className="mb-3 text-sm text-espresso-500">
          ยอดรวม {formatCurrency(c.totalAmount)} — เมื่อลงนามระบบจะสร้างงวดชำระ{c.billingType === 'DAILY' ? ' (มัดจำ 30% + ส่วนที่เหลือ)' : ' รายเดือน'}
        </p>
        <Input label="พิมพ์ชื่อ-นามสกุลผู้ลงนาม" value={signedName} onChange={(e) => setSignedName(e.target.value)} />
      </Modal>
    </div>
  );
}
