import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import QueryState, { ErrorText } from '../../components/common/QueryState';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import { useDeliveries, usePartnerMutation, usePartners } from '../../hooks/usePartners';
import { useUsers } from '../../hooks/useUsers';
import { partnerService } from '../../services/partnerService';
import { formatDateTime } from '../../utils/formatDate';

// พาร์ทเนอร์ = ระบบภายนอก (เช่น ระบบจองห้องพักของเพื่อน) ที่ส่งงานเข้ามาด้วย API key และรับ webhook กลับ
export default function PartnersPage() {
  const partners = usePartners();
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ apiKey: string; webhookSecret?: string } | null>(null);
  const rotate = usePartnerMutation(partnerService.rotateKey);
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
                {p.failedWebhooks > 0 && <Badge tone="danger" className="mt-2">webhook ล้มเหลว {p.failedWebhooks}</Badge>}
                <Button
                  variant="ghost"
                  className="mt-2 px-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('ออกคีย์ใหม่? คีย์เดิมจะใช้ไม่ได้ทันที')) rotate.mutate([p.partnerId], { onSuccess: setSecret });
                  }}
                >
                  <RefreshCw className="h-4 w-4" /> ออก API key ใหม่
                </Button>
              </Card>
            ))}
            <ErrorText error={rotate.error} />
          </div>
          {activeId && <DeliveryLog partnerId={activeId} />}
        </div>
      </QueryState>
      {creating && <CreatePartnerModal onClose={() => setCreating(false)} onCreated={setSecret} />}
      <Modal open={!!secret} title="เก็บคีย์นี้ไว้ (แสดงครั้งเดียว)" onClose={() => setSecret(null)}>
        <div className="space-y-2 text-sm">
          <p>API key</p>
          <code className="block break-all rounded bg-cream-100 p-2">{secret?.apiKey}</code>
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
                <Badge tone={d.status === 'SENT' ? 'success' : d.status === 'FAILED' ? 'danger' : 'warning'}>{d.status}</Badge>
                <span className="ml-auto text-xs text-espresso-500">{formatDateTime(d.createdAt)} · ส่ง {d.attempts} ครั้ง</span>
              </div>
              <pre className="mt-2 overflow-x-auto rounded bg-cream-100 p-2 text-xs">{JSON.stringify(d.payload, null, 2)}</pre>
              {d.lastError && <p className="mt-1 text-xs text-danger">{d.lastError}</p>}
              {d.status === 'FAILED' && <Button variant="ghost" className="mt-1 px-0" onClick={() => retry.mutate([d.deliveryId])}>ส่งใหม่</Button>}
            </li>
          ))}
        </ul>
      </QueryState>
    </Card>
  );
}

function CreatePartnerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: { apiKey: string; webhookSecret: string }) => void }) {
  const customers = useUsers('USER');
  const create = usePartnerMutation(partnerService.create);
  const [name, setName] = useState('');
  const [ownerUserId, setOwner] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  return (
    <Modal
      open
      title="เพิ่มพาร์ทเนอร์"
      onClose={onClose}
      footer={
        <Button
          disabled={!name || !ownerUserId || create.isPending}
          onClick={() => create.mutate([{ name, ownerUserId: Number(ownerUserId), webhookUrl }], { onSuccess: (r) => { onClose(); onCreated(r); } })}
        >
          สร้างและออก API key
        </Button>
      }
    >
      <div className="space-y-3">
        <Input label="ชื่อระบบพาร์ทเนอร์" value={name} onChange={(e) => setName(e.target.value)} />
        <Select
          label="บัญชีลูกค้าตัวแทน (ใช้เซ็นสัญญา/ชำระเงินของงานที่ส่งมา)"
          value={ownerUserId}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="เลือกบัญชี"
          options={(customers.data ?? []).map((u) => ({ value: u.userId, label: `${u.fullName} (${u.email})` }))}
        />
        <Input label="Webhook URL" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://partner.example.com/webhooks/renocare" />
        <ErrorText error={create.error} />
      </div>
    </Modal>
  );
}
