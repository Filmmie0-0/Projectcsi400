import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import { ErrorText } from '../../common/QueryState';
import { BILLING_TYPE, suggestBilling } from '../../../constants/labels';
import { useMaterials } from '../../../hooks/useInventory';
import { useTechnicians } from '../../../hooks/useUsers';
import { useJobMutation } from '../../../hooks/useJobs';
import { jobService } from '../../../services/jobService';
import { formatCurrency } from '../../../utils/formatCurrency';
import { todayIso } from '../../../utils/formatDate';
import type { BillingType, ContractItem, JobDetail, Survey } from '../../../types/job';

// รายเดือนคิดจากค่าแรงรายวันรวมของทีม × 26 วันทำงาน
const WORK_DAYS_PER_MONTH = 26;

export default function ContractFormModal({ job, survey, open, onClose }: { job: JobDetail; survey: Survey; open: boolean; onClose: () => void }) {
  const isAddendum = survey.surveyType === 'ADDITIONAL';
  const materials = useMaterials();
  const techs = useTechnicians();
  const create = useJobMutation(jobService.createContract);

  const teamDailyWage = useMemo(() => {
    const ids = job.assignments.map((a) => a.technicianId);
    return (techs.data ?? []).filter((t) => ids.includes(t.userId)).reduce((s, t) => s + (t.dailyWage ?? 0), 0);
  }, [techs.data, job.assignments]);

  const suggested = suggestBilling(survey.estDays ?? 1);
  const [billingType, setBillingType] = useState<BillingType>(suggested.billingType);
  const [periodQty, setPeriodQty] = useState(suggested.periodQty);
  const [rate, setRate] = useState<number | ''>('');
  const [startDate, setStartDate] = useState(todayIso());
  const [terms, setTerms] = useState('');
  const [items, setItems] = useState<ContractItem[]>([]);

  const suggestedRate = billingType === 'DAILY' ? teamDailyWage : teamDailyWage * WORK_DAYS_PER_MONTH;
  const effectiveRate = rate === '' ? suggestedRate : rate;
  const labor = effectiveRate * periodQty;
  const material = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  const addMaterial = (materialId: number) => {
    const m = materials.data?.find((x) => x.materialId === materialId);
    if (!m) return;
    setItems([...items, { materialId: m.materialId, description: m.name, qty: 1, unit: m.unit, unitPrice: m.unitCost }]);
  };
  const update = (idx: number, patch: Partial<ContractItem>) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const submit = () =>
    create.mutate(
      [{
        jobId: job.jobId, surveyId: survey.surveyId, contractType: isAddendum ? 'ADDENDUM' : 'MAIN',
        billingType, rate: effectiveRate, periodQty, startDate, terms, items,
      }],
      { onSuccess: onClose },
    );

  return (
    <Modal
      wide
      open={open}
      onClose={onClose}
      title={isAddendum ? 'ร่างสัญญาเพิ่มเติม' : 'ร่างสัญญาหลัก'}
      footer={<Button onClick={submit} disabled={create.isPending || periodQty < 1}>บันทึกฉบับร่าง</Button>}
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-cream-100 p-3 text-sm text-espresso-700">
          ช่างประเมิน <b>{survey.estDays} วัน</b> → แนะนำคิดแบบ <b>{BILLING_TYPE[suggested.billingType].label}</b>
          {' '}(งานน้อยกว่า 30 วันคิดรายวัน, ตั้งแต่ 30 วันเหมารายเดือน)
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Select
            label="รูปแบบคิดค่าแรง"
            value={billingType}
            onChange={(e) => {
              const b = e.target.value as BillingType;
              setBillingType(b);
              setPeriodQty(b === suggested.billingType ? suggested.periodQty : b === 'DAILY' ? survey.estDays ?? 1 : Math.ceil((survey.estDays ?? 30) / 30));
              setRate('');
            }}
            options={Object.entries(BILLING_TYPE).map(([v, b]) => ({ value: v, label: b.label }))}
          />
          <Input
            label={`อัตรา (บาท/${BILLING_TYPE[billingType].unit})`}
            type="number"
            min={0}
            value={rate}
            placeholder={String(suggestedRate)}
            onChange={(e) => setRate(e.target.value === '' ? '' : Number(e.target.value))}
          />
          <Input label={`จำนวน${BILLING_TYPE[billingType].unit}`} type="number" min={1} value={periodQty} onChange={(e) => setPeriodQty(Number(e.target.value))} />
          <Input label="วันเริ่มงาน" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <p className="-mt-2 text-xs text-espresso-500">ค่าแรงทีมช่างที่มอบหมาย {formatCurrency(teamDailyWage)}/วัน (เว้นช่องอัตราว่างเพื่อใช้ค่าแนะนำ)</p>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">ค่าวัสดุ</p>
            <select className="rounded-lg border border-line px-2 py-1 text-sm" value="" onChange={(e) => addMaterial(Number(e.target.value))}>
              <option value="">+ เลือกวัสดุจากคลัง</option>
              {materials.data?.map((m) => <option key={m.materialId} value={m.materialId}>{m.name} ({formatCurrency(m.unitCost)}/{m.unit})</option>)}
            </select>
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="mb-2 grid grid-cols-[1fr_80px_110px_100px_32px] items-center gap-2 text-sm">
              <input className="rounded border border-line px-2 py-1" value={it.description} onChange={(e) => update(idx, { description: e.target.value })} />
              <input type="number" min={1} className="rounded border border-line px-2 py-1" value={it.qty} onChange={(e) => update(idx, { qty: Number(e.target.value) })} />
              <input type="number" min={0} className="rounded border border-line px-2 py-1" value={it.unitPrice} onChange={(e) => update(idx, { unitPrice: Number(e.target.value) })} />
              <span className="text-right">{formatCurrency(it.qty * it.unitPrice)}</span>
              <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-espresso-300 hover:text-danger" aria-label="ลบ">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setItems([...items, { materialId: null, description: '', qty: 1, unit: 'งาน', unitPrice: 0 }])}
            className="inline-flex items-center gap-1 text-sm text-walnut-600 hover:underline"
          >
            <Plus className="h-4 w-4" /> รายการอื่น ๆ
          </button>
        </div>

        <Textarea label="เงื่อนไขสัญญา" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="เช่น รับประกันงาน 6 เดือน, ค่าแรงไม่รวมวันหยุด" />

        <div className="space-y-1 rounded-lg bg-cream-100 p-3 text-sm">
          <div className="flex justify-between"><span>ค่าแรง ({formatCurrency(effectiveRate)} × {periodQty} {BILLING_TYPE[billingType].unit})</span><span>{formatCurrency(labor)}</span></div>
          <div className="flex justify-between"><span>ค่าวัสดุ</span><span>{formatCurrency(material)}</span></div>
          <div className="flex justify-between border-t border-line pt-1 font-semibold"><span>รวม</span><span>{formatCurrency(labor + material)}</span></div>
          <p className="text-xs text-espresso-500">
            งวดชำระ: {billingType === 'DAILY' ? 'มัดจำ 30% วันเริ่มงาน + ส่วนที่เหลือเมื่อส่งมอบ' : `${periodQty} งวดรายเดือน (งวดแรกรวมค่าวัสดุ)`}
          </p>
        </div>
        <ErrorText error={create.error ?? materials.error} />
      </div>
    </Modal>
  );
}
