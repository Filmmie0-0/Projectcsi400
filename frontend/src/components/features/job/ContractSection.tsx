import { useState } from 'react';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import { FileText } from 'lucide-react';
import Modal from '../../ui/Modal';
import { ContractFileGroup, FilePickButton, checkContractFile, useObjectUrl } from './ContractFiles';
import StatusBadge from '../../common/StatusBadge';
import { ErrorText } from '../../common/QueryState';
import ContractFormModal from './ContractFormModal';
import { BILLING_TYPE } from '../../../constants/labels';
import { useJobMutation } from '../../../hooks/useJobs';
import { jobService } from '../../../services/jobService';
import { promptDialog } from '../../../store/dialogStore';
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
  const upload = useJobMutation(jobService.uploadContractFile);
  const removeFile = useJobMutation(jobService.deleteContractFile);
  const [signing, setSigning] = useState(false);
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const signedPreview = useObjectUrl(signedFile);
  const error = send.error ?? remove.error ?? sign.error ?? reject.error ?? upload.error ?? removeFile.error;
  const contractFiles = c.files?.filter((f) => f.kind === 'CONTRACT') ?? [];
  const signedFiles = c.files?.filter((f) => f.kind === 'SIGNED') ?? [];
  const isDraftAdmin = role === 'ADMIN' && c.status === 'DRAFT';

  const pick = (file: File, then: (f: File) => void) => {
    const problem = checkContractFile(file);
    setFileError(problem);
    if (!problem) then(file);
  };
  const closeSign = () => { setSigning(false); setSignedFile(null); setFileError(null); };

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
      {(contractFiles.length > 0 || signedFiles.length > 0 || isDraftAdmin) && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <ContractFileGroup
            title="ไฟล์สัญญา"
            files={contractFiles}
            onRemove={isDraftAdmin ? (f) => removeFile.mutate([c.contractId, f.fileId]) : undefined}
          />
          {isDraftAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <FilePickButton
                label={upload.isPending ? 'กำลังอัปโหลด...' : 'แนบไฟล์สัญญา'}
                disabled={upload.isPending}
                onPick={(f) => pick(f, (ok) => upload.mutate([c.contractId, ok]))}
              />
              {!contractFiles.length && <span className="text-xs text-espresso-500">แนบรูป/PDF สัญญาก่อนส่งให้ลูกค้า</span>}
            </div>
          )}
          <ContractFileGroup title="สัญญาที่ลูกค้าเซ็นแล้ว" files={signedFiles} />
        </div>
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
            <Button onClick={() => send.mutate([c.contractId])} disabled={send.isPending || !contractFiles.length}>ส่งให้ลูกค้า</Button>
            <Button variant="ghost" onClick={() => remove.mutate([c.contractId])} disabled={remove.isPending}>ลบร่าง</Button>
          </>
        )}
        {role === 'USER' && c.status === 'SENT' && (
          <>
            <Button onClick={() => setSigning(true)}>ลงนามสัญญา</Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const reason = await promptDialog({ title: `ปฏิเสธสัญญา ${c.contractNo}`, input: { label: 'เหตุผลที่ปฏิเสธ' }, confirmText: 'ปฏิเสธสัญญา', danger: true });
                if (reason !== null) reject.mutate([c.contractId, reason]);
              }}
            >
              ปฏิเสธ
            </Button>
          </>
        )}
      </div>
      {!signing && fileError && <p className="mt-2 text-sm text-danger">{fileError}</p>}
      <ErrorText error={error} />

      <Modal
        open={signing}
        onClose={closeSign}
        title={`ลงนามสัญญา ${c.contractNo}`}
        footer={
          <Button disabled={!signedFile || sign.isPending} onClick={() => sign.mutate([c.contractId, signedFile!], { onSuccess: closeSign })}>
            {sign.isPending ? 'กำลังส่ง...' : 'ส่งสัญญาที่เซ็นแล้ว'}
          </Button>
        }
      >
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-espresso-700">
          <li>เปิดไฟล์สัญญาด้านล่าง พิมพ์หรือเปิดบนมือถือ แล้วเซ็นชื่อ</li>
          <li>ถ่ายรูปหรือสแกนสัญญาที่เซ็นแล้ว แล้วแนบกลับมา</li>
        </ol>
        <ContractFileGroup title="ไฟล์สัญญาจากเรา" files={contractFiles} />
        <div className="mt-4 space-y-2">
          <FilePickButton label={signedFile ? 'เปลี่ยนไฟล์' : 'แนบรูปสัญญาที่เซ็นแล้ว'} onPick={(f) => pick(f, setSignedFile)} />
          {signedFile && (
            <div className="flex items-center gap-3 rounded-lg border border-line p-2 text-sm">
              {signedPreview && signedFile.type.startsWith('image/')
                ? <img src={signedPreview} alt="ตัวอย่างสัญญาที่เซ็น" className="h-20 w-20 rounded bg-white object-contain" />
                : <FileText className="h-10 w-10 text-walnut-500" />}
              <span className="truncate">{signedFile.name}</span>
            </div>
          )}
          {fileError && <p className="text-sm text-danger">{fileError}</p>}
          <ErrorText error={sign.error} />
        </div>
        <p className="mt-4 text-xs text-espresso-500">
          ยอดรวม {formatCurrency(c.totalAmount)} — เมื่อส่งแล้วถือว่าลงนาม และระบบจะสร้างงวดชำระ{c.billingType === 'DAILY' ? ' (มัดจำ 30% + ส่วนที่เหลือ)' : ' รายเดือน'}
        </p>
      </Modal>
    </div>
  );
}
