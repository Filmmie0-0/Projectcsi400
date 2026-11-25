import { useState } from 'react';
import { Building2, Plus, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import QueryState, { ErrorText } from '../../components/common/QueryState';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import { useDeliveries, usePartnerMutation, usePartners } from '../../hooks/usePartners';
import { useCreateUser, useUsers } from '../../hooks/useUsers';
import { partnerService } from '../../services/partnerService';
import { API_URL } from '../../services/apiClient';
import type { Partner } from '../../types/partner';
import { confirmDialog } from '../../store/dialogStore';
import { formatDateTime } from '../../utils/formatDate';

type CreatedPartner = { apiKey?: string; webhookSecret?: string; login?: { email: string; password: string } };

// พาร์ทเนอร์ = ระบบภายนอก (เช่น ระบบจองห้องพักของเพื่อน) ที่ส่งงานเข้ามาด้วย API key และรับ webhook กลับ
export default function PartnersPage() {
  const partners = usePartners();
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState<Partner | null>(null);
  const [secret, setSecret] = useState<CreatedPartner | null>(null);
  const rotate = usePartnerMutation(partnerService.rotateKey);
  const rotateSecret = usePartnerMutation(partnerService.rotateSecret);
  const activeId = selected ?? partners.data?.[0]?.partnerId ?? null;

  return (
    <>
      <PageHeader
        title="พาร์ทเนอร์ API"
        description="ออก API key ให้ระบบภายนอกส่งงานเข้า และดูประวัติ webhook ที่ส่งกลับ"
        action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> เพิ่มพาร์ทเนอร์</Button>}
      />
      <QueryState query={partners}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
          <div className="space-y-3">
            {partners.data?.map((p) => (
              <Card
                key={p.partnerId}
                onClick={() => setSelected(p.partnerId)}
                className={`cursor-pointer p-4 ${activeId === p.partnerId ? 'ring-2 ring-walnut-400' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{p.name}</p>
                  <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'ใช้งาน' : 'ปิด'}</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-espresso-500">{p.apiKeyPrefix}… · {p.totalJobs} งาน</p>
                <p className="mt-1 truncate text-xs text-espresso-500">webhook: {p.webhookUrl ?? '-'}</p>
                {p.buildingRef && <p className="mt-1 text-xs text-espresso-500">เชื่อมระบบหอพัก · อาคาร {p.buildingRef}</p>}
                {p.failedWebhooks > 0 && <Badge tone="danger" className="mt-2">webhook ล้มเหลว {p.failedWebhooks}</Badge>}
                <Button
                  variant="ghost"
                  className="mt-2 px-0"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (await confirmDialog({ title: 'ออก API key ใหม่?', message: 'คีย์เดิมจะใช้ไม่ได้ทันที ระบบพาร์ทเนอร์ต้องเปลี่ยนไปใช้คีย์ใหม่', confirmText: 'ออกคีย์ใหม่', danger: true })) {
                      rotate.mutate([p.partnerId], { onSuccess: setSecret });
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4" /> ออก API key ใหม่
                </Button>
                <Button
                  variant="ghost"
                  className="mt-2 ml-4 px-0"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (await confirmDialog({ title: 'ออก webhook secret ใหม่?', message: 'secret เดิมใช้ไม่ได้ทันที ลายเซ็นทั้งงานที่พาร์ทเนอร์ส่งมาและสถานะที่เราส่งกลับจะไม่ผ่าน จนกว่าพาร์ทเนอร์จะเปลี่ยนไปใช้ secret ใหม่', confirmText: 'ออก secret ใหม่', danger: true })) {
                      rotateSecret.mutate([p.partnerId], { onSuccess: setSecret });
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4" /> ออก secret ใหม่
                </Button>
                <Button
                  variant="ghost"
                  className="mt-2 ml-4 px-0"
                  onClick={(e) => { e.stopPropagation(); setConnecting(p); }}
                >
                  <Building2 className="h-4 w-4" /> เชื่อมระบบหอพัก
                </Button>
              </Card>
            ))}
            <ErrorText error={rotate.error ?? rotateSecret.error} />
          </div>
          {activeId && <DeliveryLog partnerId={activeId} />}
        </div>
      </QueryState>
      {connecting && <DormConnectModal partner={connecting} onClose={() => setConnecting(null)} />}
      {creating && <CreatePartnerModal onClose={() => setCreating(false)} onCreated={setSecret} />}
      <Modal open={!!secret} title="เก็บคีย์นี้ไว้ (แสดงครั้งเดียว)" onClose={() => setSecret(null)}>
        <div className="space-y-2 text-sm">
          {secret?.apiKey && (
            <>
              <p>API key</p>
              <code className="block break-all rounded bg-cream-100 p-2">{secret.apiKey}</code>
            </>
          )}
          {secret?.login && (
            <>
              <p>บัญชีพาร์ทเนอร์ (ส่งให้พาร์ทเนอร์ใช้ล็อกอินเว็บ)</p>
              <code className="block break-all rounded bg-cream-100 p-2">{secret.login.email} / {secret.login.password}</code>
            </>
          )}
          {secret?.webhookSecret && (
            <>
              <p>Webhook secret (ใช้ตรวจ X-Signature)</p>
              <code className="block break-all rounded bg-cream-100 p-2">{secret.webhookSecret}</code>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

function DeliveryLog({ partnerId }: { partnerId: number }) {
  const deliveries = useDeliveries(partnerId);
  const retry = usePartnerMutation(partnerService.retryDelivery);
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Webhook ที่ส่งให้พาร์ทเนอร์</h2>
      <QueryState query={deliveries}>
        {!deliveries.data?.length && <p className="text-sm text-espresso-500">ยังไม่มี webhook</p>}
        <ul className="space-y-2">
          {deliveries.data?.map((d) => (
            <li key={d.deliveryId} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono">{d.event}</span>
                <Badge tone={d.status === 'SENT' ? 'success' : d.status === 'FAILED' ? 'danger' : d.status === 'SKIPPED' ? 'neutral' : 'warning'}>{d.status === 'SKIPPED' ? 'ไม่ต้องส่ง' : d.status}</Badge>
                <span className="ml-auto text-xs text-espresso-500">{formatDateTime(d.createdAt)} · ส่ง {d.attempts} ครั้ง</span>
              </div>
              <pre className="mt-2 overflow-x-auto rounded bg-cream-100 p-2 text-xs">{JSON.stringify(d.payload, null, 2)}</pre>
              {d.lastError && <p className={`mt-1 text-xs ${d.status === 'SKIPPED' ? 'text-espresso-500' : 'text-danger'}`}>{d.lastError}</p>}
              {d.status === 'FAILED' && <Button variant="ghost" className="mt-1 px-0" onClick={() => retry.mutate([d.deliveryId])}>ส่งใหม่</Button>}
            </li>
          ))}
        </ul>
      </QueryState>
    </Card>
  );
}

// 1 พาร์ทเนอร์ = 1 บัญชีพาร์ทเนอร์ (USER) งานที่พาร์ทเนอร์ส่งมาจะผูกกับบัญชีนี้ ใช้ล็อกอินมาเซ็นสัญญา/แจ้งชำระเงิน
// ค่าเริ่มต้นคือสร้างบัญชีใหม่พร้อมกัน (auth-service ก่อน แล้วค่อยสร้างพาร์ทเนอร์ใน job-service)
function CreatePartnerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: CreatedPartner) => void }) {
  const accounts = useUsers('USER');
  const createUser = useCreateUser();
  const create = usePartnerMutation(partnerService.create);
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [ownerUserId, setOwner] = useState('');
  const [account, setAccount] = useState({ fullName: '', email: '', phone: '', password: '' });
  // ถ้าสร้างบัญชีสำเร็จแต่สร้างพาร์ทเนอร์ไม่สำเร็จ กดซ้ำจะใช้บัญชีเดิม ไม่สร้างซ้ำ
  const [createdUserId, setCreatedUserId] = useState<number | null>(null);
  const setAcc = (k: keyof typeof account) => (e: { target: { value: string } }) => setAccount({ ...account, [k]: e.target.value });

  const accountReady = mode === 'existing'
    ? !!ownerUserId
    : !!createdUserId || (!!account.fullName.trim() && !!account.email.trim() && account.password.length >= 8);
  const busy = createUser.isPending || create.isPending;

  const submit = async () => {
    let userId = mode === 'existing' ? Number(ownerUserId) : createdUserId;
    if (!userId) {
      const user = await createUser.mutateAsync({
        role: 'USER', fullName: account.fullName.trim(), email: account.email.trim(), password: account.password,
        phone: account.phone.trim() || undefined,
      });
      userId = user.userId;
      setCreatedUserId(userId);
    }
    const r = await create.mutateAsync([{ name, ownerUserId: userId, webhookUrl }]);
    onClose();
    onCreated(mode === 'new' ? { ...r, login: { email: account.email.trim(), password: account.password } } : r);
  };

  return (
    <Modal
      open
      title="เพิ่มพาร์ทเนอร์"
      onClose={onClose}
      footer={
        <Button disabled={!name.trim() || !accountReady || busy} onClick={() => submit().catch(() => {})}>
          {mode === 'new' ? 'สร้างพาร์ทเนอร์ + บัญชี และออก API key' : 'สร้างและออก API key'}
        </Button>
      }
    >
      <div className="space-y-3">
        <Input label="ชื่อพาร์ทเนอร์ (เช่น ชื่อหอพัก)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Webhook URL" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://partner.example.com/webhooks/renocare" />

        <div className="space-y-2 rounded-lg border border-line p-3">
          <p className="text-sm font-medium">บัญชีพาร์ทเนอร์ (ใช้ล็อกอินมาเซ็นสัญญา/แจ้งชำระเงินของงานที่ส่งมา)</p>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} disabled={!!createdUserId} /> สร้างบัญชีใหม่
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} disabled={!!createdUserId} /> ใช้บัญชีที่มีอยู่
            </label>
          </div>
          {mode === 'new' ? (
            createdUserId ? (
              <p className="text-sm text-espresso-500">สร้างบัญชี {account.email} แล้ว กดปุ่มอีกครั้งเพื่อสร้างพาร์ทเนอร์</p>
            ) : (
              <>
                <Input label="ชื่อผู้ติดต่อ" value={account.fullName} onChange={setAcc('fullName')} />
                <Input label="อีเมล (ใช้ล็อกอิน)" type="email" value={account.email} onChange={setAcc('email')} />
                <Input label="เบอร์โทร" value={account.phone} onChange={setAcc('phone')} />
                <Input label="รหัสผ่านเริ่มต้น (อย่างน้อย 8 ตัว)" type="text" value={account.password} onChange={setAcc('password')} />
              </>
            )
          ) : (
            <Select
              label="เลือกบัญชี"
              value={ownerUserId}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="เลือกบัญชี"
              options={(accounts.data ?? []).map((u) => ({ value: u.userId, label: `${u.fullName} (${u.email})` }))}
            />
          )}
        </div>
        <ErrorText error={createUser.error ?? create.error} />
      </div>
    </Modal>
  );
}

// ตั้งค่าการเชื่อมกับ Repair API ของระบบหอพัก: หอพักส่งงานมาที่ /dorm-webhook และเราเรียก API หอพักด้วย key rpk_
function DormConnectModal({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const update = usePartnerMutation(partnerService.update);
  const [form, setForm] = useState({
    buildingRef: partner.buildingRef ?? '',
    apiBaseUrl: partner.apiBaseUrl ?? '',
    outboundApiKey: '',
    webhookUrl: partner.webhookUrl ?? '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const inboundUrl = `${API_URL}/partner/v1/dorm-webhook`;
  return (
    <Modal
      open
      title={`เชื่อมระบบหอพัก — ${partner.name}`}
      onClose={onClose}
      footer={
        <Button disabled={!form.buildingRef.trim() || update.isPending} onClick={() => update.mutate([partner.partnerId, form], { onSuccess: onClose })}>
          บันทึก
        </Button>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="space-y-1 rounded-lg bg-cream-100 p-3">
          <p className="font-medium">ส่งให้หอพักกรอกในหน้า "เชื่อมต่อระบบของช่าง (RenoCare)"</p>
          <p>URL รับ webhook ของเรา (ช่อง Webhook URL ของช่าง)</p>
          <code className="block break-all">{inboundUrl}</code>
          <p className="text-espresso-500">พร้อม API key ({partner.apiKeyPrefix}…) และ webhook secret ที่ได้ตอนสร้างพาร์ทเนอร์</p>
        </div>
        <Input label="รหัสอาคารฝั่งหอพัก" value={form.buildingRef} onChange={set('buildingRef')} placeholder="เช่น DORM-A" />
        <Input label="Base URL ของ Repair API หอพัก" value={form.apiBaseUrl} onChange={set('apiBaseUrl')} placeholder="https://backend.example.com/api/repair/v1" />
        <Input
          label={`API key ที่หอพักออกให้ (rpk_...)${partner.hasOutboundKey ? ' — บันทึกไว้แล้ว เว้นว่างถ้าไม่เปลี่ยน' : ''}`}
          value={form.outboundApiKey}
          onChange={set('outboundApiKey')}
          type="password"
        />
        <Input label="Webhook URL ของหอพัก (เราส่งสถานะงานกลับไปที่นี่)" value={form.webhookUrl} onChange={set('webhookUrl')} placeholder="https://backend.example.com/api/repair/webhooks/renocare/DORM-A" />
        <ErrorText error={update.error} />
      </div>
    </Modal>
  );
}
