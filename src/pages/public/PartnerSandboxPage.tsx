import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Send, XCircle } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { JOB_STATUS, JOB_TYPE, toOptions } from '../../constants/labels';
import { partnerApiClient } from '../../services/partnerService';
import { toApiError } from '../../services/apiError';
import { formatDateTime } from '../../utils/formatDate';
import type { JobType } from '../../types/job';

// คีย์เดโมจาก database/services/02_job_db.sql
const DEMO_KEY = 'dbk_live_demo_7f3a9c2e1b';

interface LogEntry { at: string; method: string; path: string; status: number; body: unknown }

// จำลองฝั่ง "ระบบจองห้องพักของเพื่อน": ซ้าย = เรียก Partner API ของเรา, ขวา = webhook ที่ระบบเพื่อนได้รับกลับ
export default function PartnerSandboxPage() {
  const [apiKey, setApiKey] = useState(DEMO_KEY);
  const [form, setForm] = useState({
    externalRef: `BK-${Math.floor(10000 + Math.random() * 89999)}-OUT`,
    jobType: 'INSPECTION' as JobType,
    unitCode: '203',
    title: 'ตรวจห้องหลังผู้เช่าย้ายออก ห้อง 203',
    preferredDate: '',
  });
  const [lookupRef, setLookupRef] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const inbox = useQuery({ queryKey: ['mock-partner-inbox'], queryFn: partnerApiClient.inbox, refetchInterval: 3000 });

  const call = async (method: string, path: string, fn: () => Promise<{ status: number; data: unknown }>) => {
    const at = new Date().toISOString();
    try {
      const r = await fn();
      setLog((l) => [{ at, method, path, status: r.status, body: r.data }, ...l]);
    } catch (err) {
      const e = toApiError(err);
      setLog((l) => [{ at, method, path, status: e.status, body: { code: e.code, message: e.message } }, ...l]);
    }
  };

  const sendJob = () =>
    call('POST', '/partner/v1/jobs', () =>
      partnerApiClient.createJob(apiKey, {
        externalRef: form.externalRef,
        jobType: form.jobType,
        building: { externalRef: 'DB-BLD-001', name: 'บ้านริมคลอง เรสซิเดนซ์', address: 'ถ.พหลโยธิน กม.42 อ.คลองหลวง จ.ปทุมธานี' },
        unit: { externalRef: `DB-RM-${form.unitCode}`, code: form.unitCode, unitType: 'ROOM', floor: form.unitCode.charAt(0) },
        title: form.title,
        priority: 'NORMAL',
        preferredDate: form.preferredDate || undefined,
        contact: { name: 'คุณนิด (DormBook)', phone: '0822222222' },
      }).then((r) => {
        setLookupRef(form.externalRef);
        return r;
      }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner Sandbox"
        description="ทดลองเป็นระบบจองห้องพัก (DormBook): ส่งงานผ่าน API key แล้วดู webhook ที่ RenoCare ส่งกลับเมื่อสถานะเปลี่ยน"
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="space-y-3">
            <h2 className="font-semibold">1. ส่งงานเข้า RenoCare</h2>
            <Input label="X-API-Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="font-mono text-xs" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="externalRef (เลขการจอง)" value={form.externalRef} onChange={(e) => setForm({ ...form, externalRef: e.target.value })} />
              <Select label="ประเภทงาน" value={form.jobType} onChange={(e) => setForm({ ...form, jobType: e.target.value as JobType })} options={toOptions(JOB_TYPE)} />
              <Input label="ห้อง" value={form.unitCode} onChange={(e) => setForm({ ...form, unitCode: e.target.value })} />
              <Input label="วันที่ต้องการ" type="date" value={form.preferredDate} onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} />
            </div>
            <Input label="หัวข้อ" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Button onClick={sendJob}><Send className="h-4 w-4" /> POST /partner/v1/jobs</Button>
            <p className="text-xs text-espresso-500">ส่ง externalRef เดิมซ้ำ = ได้งานเดิมกลับมา (200) ไม่สร้างงานซ้ำ</p>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold">2. ถามสถานะ / ยกเลิก</h2>
            <Input label="externalRef" value={lookupRef} onChange={(e) => setLookupRef(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!lookupRef} onClick={() => call('GET', `/partner/v1/jobs/${lookupRef}`,
                () => partnerApiClient.getJob(apiKey, lookupRef).then((data) => ({ status: 200, data })))}>
                GET สถานะ
              </Button>
              <Button variant="ghost" disabled={!lookupRef} onClick={() => call('POST', `/partner/v1/jobs/${lookupRef}/cancel`,
                () => partnerApiClient.cancelJob(apiKey, lookupRef).then((data) => ({ status: 200, data })))}>
                ยกเลิกงาน
              </Button>
            </div>
          </Card>

          <Card className="space-y-2">
            <h2 className="font-semibold">Request log</h2>
            {!log.length && <p className="text-sm text-espresso-500">ยังไม่มีการเรียก API</p>}
            {log.map((l) => (
              <div key={l.at} className="rounded-lg border border-line p-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge tone={l.status >= 200 && l.status < 300 ? 'success' : 'danger'}>{l.status || 'ERR'}</Badge>
                  <span className="font-mono">{l.method} {l.path}</span>
                </div>
                <pre className="mt-1 overflow-x-auto text-espresso-700">{JSON.stringify(l.body, null, 2)}</pre>
              </div>
            ))}
          </Card>
        </div>

        <Card className="space-y-3">
          <h2 className="font-semibold">3. Webhook ที่ระบบจองได้รับ</h2>
          <p className="text-xs text-espresso-500">
            ล็อกอินเป็นแอดมิน/ช่างในอีกแท็บ แล้วมอบหมายช่าง ส่งผลประเมิน ส่งสัญญา — เหตุการณ์จะเด้งมาที่นี่ (อัปเดตทุก 3 วินาที)
          </p>
          {inbox.isError && <p className="text-sm text-danger">{toApiError(inbox.error).message}</p>}
          {!inbox.data?.length && !inbox.isError && <p className="text-sm text-espresso-500">ยังไม่มี webhook</p>}
          {inbox.data?.map((e) => (
            <div key={e.receivedAt + e.body.event} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {e.signatureValid ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-danger" />}
                <span className="font-mono font-medium">{e.body.event}</span>
                <span className="font-mono text-xs text-espresso-500">{e.body.externalRef}</span>
                {typeof e.body.to === 'string' && e.body.to in JOB_STATUS && (
                  <Badge tone={JOB_STATUS[e.body.to as keyof typeof JOB_STATUS].tone}>{JOB_STATUS[e.body.to as keyof typeof JOB_STATUS].label}</Badge>
                )}
                <span className="ml-auto text-xs text-espresso-500">{formatDateTime(e.receivedAt)}</span>
              </div>
              <pre className="mt-2 overflow-x-auto rounded bg-cream-100 p-2 text-xs">{JSON.stringify(e.body, null, 2)}</pre>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
