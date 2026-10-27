import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import { ErrorText } from '../../common/QueryState';
import { ACTION, CONDITION } from '../../../constants/labels';
import { useJobMutation } from '../../../hooks/useJobs';
import { jobService } from '../../../services/jobService';
import type { ItemAction, ItemCondition, JobDetail, SurveyItem } from '../../../types/job';

// เช็กลิสต์มาตรฐานตรวจห้องเช่า (ช่างแก้/เพิ่มได้)
const INSPECTION_TEMPLATE: [string, string][] = [
  ['ห้องนอน', 'ผนัง/สี'], ['ห้องนอน', 'พื้น'], ['ห้องนอน', 'ประตู/หน้าต่าง/มุ้งลวด'],
  ['ห้องน้ำ', 'สุขภัณฑ์'], ['ห้องน้ำ', 'ก๊อก/ฝักบัว'], ['ห้องน้ำ', 'ยาแนว/ท่อระบายน้ำ'],
  ['ไฟฟ้า', 'ปลั๊ก/สวิตช์'], ['ไฟฟ้า', 'หลอดไฟ'], ['เครื่องใช้', 'แอร์'], ['เครื่องใช้', 'เตียง/ตู้เสื้อผ้า'],
];

const blank = (area = '', item = ''): SurveyItem => ({ area, item, itemCondition: 'GOOD', action: 'NONE', estCost: 0, note: '' });

export default function SurveyFormModal({ job, open, onClose }: { job: JobDetail; open: boolean; onClose: () => void }) {
  const additional = job.status !== 'SURVEY_ASSIGNED';
  const [summary, setSummary] = useState('');
  const [estDays, setEstDays] = useState(1);
  const [needRepair, setNeedRepair] = useState(additional);
  const [items, setItems] = useState<SurveyItem[]>(() =>
    job.jobType === 'INSPECTION' && !additional ? INSPECTION_TEMPLATE.map(([a, i]) => blank(a, i)) : [blank()]);
  const submit = useJobMutation(jobService.submitSurvey);

  const update = (idx: number, patch: Partial<SurveyItem>) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const totalCost = items.reduce((s, i) => s + Number(i.estCost || 0), 0);

  return (
    <Modal
      wide
      open={open}
      onClose={onClose}
      title={additional ? 'แจ้งงานเพิ่ม (ประเมินเพิ่มเติม)' : 'บันทึกผลประเมินหน้างาน'}
      footer={
        <Button
          disabled={!summary.trim() || submit.isPending}
          onClick={() => submit.mutate(
            [job.jobId, { summary, estDays, needRepair, items: items.filter((i) => i.area && i.item) }],
            { onSuccess: onClose },
          )}
        >
          ส่งผลประเมิน
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-espresso-500">
              <tr><th className="pb-2">บริเวณ</th><th>รายการ</th><th>สภาพ</th><th>ต้องทำ</th><th>ประเมิน (บาท)</th><th>หมายเหตุ</th><th /></tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-t border-line/60">
                  <td className="py-1.5 pr-1"><input className="w-24 rounded border border-line px-2 py-1" value={it.area} onChange={(e) => update(idx, { area: e.target.value })} /></td>
                  <td className="pr-1"><input className="w-36 rounded border border-line px-2 py-1" value={it.item} onChange={(e) => update(idx, { item: e.target.value })} /></td>
                  <td className="pr-1">
                    <select className="rounded border border-line px-1 py-1" value={it.itemCondition} onChange={(e) => update(idx, { itemCondition: e.target.value as ItemCondition })}>
                      {Object.entries(CONDITION).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                    </select>
                  </td>
                  <td className="pr-1">
                    <select className="rounded border border-line px-1 py-1" value={it.action} onChange={(e) => update(idx, { action: e.target.value as ItemAction })}>
                      {Object.entries(ACTION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="pr-1"><input type="number" min={0} className="w-24 rounded border border-line px-2 py-1" value={it.estCost} onChange={(e) => update(idx, { estCost: Number(e.target.value) })} /></td>
                  <td className="pr-1"><input className="w-32 rounded border border-line px-2 py-1" value={it.note ?? ''} onChange={(e) => update(idx, { note: e.target.value })} /></td>
                  <td>
                    <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="p-1 text-espresso-300 hover:text-danger" aria-label="ลบ">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setItems([...items, blank()])} className="mt-2 inline-flex items-center gap-1 text-sm text-walnut-600 hover:underline">
            <Plus className="h-4 w-4" /> เพิ่มรายการ
          </button>
          <p className="mt-1 text-right text-sm text-espresso-500">ประเมินค่าใช้จ่ายรวม {totalCost.toLocaleString('th-TH')} บาท</p>
        </div>

        <Textarea label="สรุปผลประเมิน" value={summary} onChange={(e) => setSummary(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="ประเมินระยะเวลาทำงาน (วัน)" type="number" min={1} value={estDays} onChange={(e) => setEstDays(Number(e.target.value))} />
          {!additional && (
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={needRepair} onChange={(e) => setNeedRepair(e.target.checked)} />
              ต้องซ่อม/ปรับปรุง (ทำสัญญาต่อ)
            </label>
          )}
        </div>
        {job.jobType === 'INSPECTION' && !additional && !needRepair && (
          <p className="text-xs text-espresso-500">ไม่ติ๊ก "ต้องซ่อม" = ปิดงานตรวจห้องทันทีและแจ้งผลกลับระบบพาร์ทเนอร์</p>
        )}
        <ErrorText error={submit.error} />
      </div>
    </Modal>
  );
}
