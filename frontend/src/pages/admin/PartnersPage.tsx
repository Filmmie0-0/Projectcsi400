import { useState } from 'react';
import { Check, Copy, Pencil, PlugZap, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import QueryState, { ErrorText } from '../../components/common/QueryState';
import Card from '../../components/ui/Card';
import Badge, { type Tone } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import { useDeliveries, usePartnerMutation, usePartnerSyncLogs, usePartners } from '../../hooks/usePartners';
import { useUsers } from '../../hooks/useUsers';
import { API_URL } from '../../services/apiClient';
import { partnerService } from '../../services/partnerService';
import { confirmDialog } from '../../store/dialogStore';
import { toast } from '../../store/toastStore';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import type { IntegrationMode, Partner, PartnerSyncResult, RemoteVendorResponse } from '../../types/partner';

const DEFAULT_REPAIR_API_URL = 'https://backend.ayasakimioweb.com/api/repair/v1';

const DIRECTION_LABEL: Record<string, { label: string; tone: Tone }> = {
  INBOUND_POLL: { label: 'ดึงงาน', tone: 'info' },
  INBOUND_WEBHOOK: { label: 'Webhook เข้า', tone: 'brand' },
  OUTBOUND_STATUS: { label: 'อัปเดตสถานะกลับ', tone: 'warning' },
  OUTBOUND_VENDOR: { label: 'ตรวจสัญญา', tone: 'neutral' },
  OUTBOUND_OWNER: { label: 'ดึงข้อมูลเจ้าของหอ', tone: 'neutral' },
};

const REMOTE_STATUS_LABEL: Record<string, string> = {
  sent: 'รอรับงาน',
  accepted: 'รับงานแล้ว',
  in_progress: 'กำลังซ่อม',
  done: 'ซ่อมเสร็จ',
  rejected: 'ปฏิเสธงาน',
  cancelled: 'ยกเลิก',
};

function buildWebhookUrl(partnerId: number) {
  const base = API_URL.startsWith('http') ? API_URL : `${window.location.origin}${API_URL}`;
  return `${base.replace(/\/+$/, '')}/partner/v1/repair-webhook/${partnerId}`;
}

export default function PartnersPage() {
  const partners = usePartners();
  const [selected, setSelected] = useState<number | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; partner: Partner } | null>(null);
  const [secret, setSecret] = useState<{ apiKey: string; webhookSecret?: string } | null>(null);
  const rotate = usePartnerMutation(partnerService.rotateKey);
  const list = partners.data ?? [];
  const activePartner = list.find((p) => p.partnerId === selected) ?? list[0] ?? null;

  return (
    <>
      <PageHeader
        title="พาร์ทเนอร์ API"
        description="เชื่อมเว็บหอพักเพื่อน (Repair API v1) หรือออก API key ให้ระบบภายนอกส่งงานเข้า"
        action={<Button onClick={() => setModal({ mode: 'create' })}><Plus className="h-4 w-4" /> เพิ่มพาร์ทเนอร์</Button>}
      />
      <QueryState query={partners}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
          <div className="space-y-3">
            {list.map((p) => (
              <Card
                key={p.partnerId}
                onClick={() => setSelected(p.partnerId)}
                className={`cursor-pointer p-4 ${activePartner?.partnerId === p.partnerId ? 'ring-2 ring-walnut-400' : ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{p.name}</p>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={p.integrationMode === 'REPAIR_API_V1' ? 'info' : 'neutral'}>
                      {p.integrationMode === 'REPAIR_API_V1' ? 'Repair API v1' : 'Partner Push'}
                    </Badge>
                    <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'ใช้งาน' : 'ปิด'}</Badge>
                  </div>
                </div>
                {p.integrationMode === 'REPAIR_API_V1' ? (
                  <div className="mt-1.5 space-y-1 text-xs text-espresso-500">
                    <p className="truncate font-mono">{p.apiBaseUrl ?? '-'}</p>
                    <p>
                      {p.hasOutboundKey ? `Key: ${p.outboundKeyPrefix}` : 'ยังไม่ใส่ API Key'} · {p.totalJobs} งาน
                      {p.syncEnabled ? ' · ซิงค์อัตโนมัติ' : ' · ซิงค์ด้วยมือ'}
                    </p>
                    {p.lastSyncedAt && <p>ซิงค์ล่าสุด: {formatDateTime(p.lastSyncedAt)}</p>}
                    {p.lastSyncError && <p className="text-danger">{p.lastSyncError}</p>}
                  </div>
                ) : (
                  <div className="mt-1 space-y-1 text-xs text-espresso-500">
                    <p className="font-mono">{p.apiKeyPrefix}… · {p.totalJobs} งาน</p>
                    <p className="truncate">webhook: {p.webhookUrl ?? '-'}</p>
                    {p.failedWebhooks > 0 && <Badge tone="danger" className="mt-1">webhook ล้มเหลว {p.failedWebhooks}</Badge>}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-3">
                  <Button
                    variant="ghost"
                    className="px-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModal({ mode: 'edit', partner: p });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> ตั้งค่า / แก้ไข
                  </Button>
                  {p.integrationMode === 'PARTNER_PUSH' && (
                    <Button
                      variant="ghost"
                      className="px-0"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (await confirmDialog({ title: 'ออก API key ใหม่?', message: 'คีย์เดิมจะใช้ไม่ได้ทันที ระบบพาร์ทเนอร์ต้องเปลี่ยนไปใช้คีย์ใหม่', confirmText: 'ออกคีย์ใหม่', danger: true })) {
                          rotate.mutate([p.partnerId], { onSuccess: setSecret });
                        }
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> ออก API key ใหม่
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            <ErrorText error={rotate.error} />
          </div>

          {activePartner && (
            activePartner.integrationMode === 'REPAIR_API_V1'
              ? <RepairApiPanel key={activePartner.partnerId} partner={activePartner} />
              : <DeliveryLog partnerId={activePartner.partnerId} />
          )}
        </div>
      </QueryState>

      {modal && (
        <PartnerFormModal
          partner={modal.mode === 'edit' ? modal.partner : undefined}
          onClose={() => setModal(null)}
          onCreated={(res, mode) => {
            setSelected(res.partnerId);
            if (mode === 'PARTNER_PUSH') setSecret(res);
          }}
        />
      )}

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

function RepairApiPanel({ partner }: { partner: Partner }) {
  const [vendorInfo, setVendorInfo] = useState<RemoteVendorResponse | null>(null);
  const [syncResult, setSyncResult] = useState<PartnerSyncResult | null>(null);
  const [copied, setCopied] = useState(false);
  const checkVendor = usePartnerMutation(partnerService.remoteVendor);
  const syncJobs = usePartnerMutation(partnerService.sync);
  const logs = usePartnerSyncLogs(partner.partnerId);
  const webhookEndpoint = buildWebhookUrl(partner.partnerId);

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookEndpoint);
    setCopied(true);
    toast.success('คัดลอก Webhook URL แล้ว');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">การเชื่อมต่อ Repair API v1</h2>
            <p className="text-xs text-espresso-500">ดึงงานซ่อมจากหอพักและส่งสถานะกลับแบบอัตโนมัติ (X-Repair-Api-Key)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!partner.hasOutboundKey || checkVendor.isPending}
              onClick={() => checkVendor.mutate([partner.partnerId], { onSuccess: setVendorInfo })}
            >
              <ShieldCheck className="h-4 w-4" /> {checkVendor.isPending ? 'กำลังตรวจ...' : 'ทดสอบเชื่อมต่อ (GET /vendor)'}
            </Button>
            <Button
              disabled={!partner.hasOutboundKey || !partner.isActive || syncJobs.isPending}
              onClick={() => syncJobs.mutate([partner.partnerId], { onSuccess: setSyncResult })}
            >
              <RefreshCw className={`h-4 w-4 ${syncJobs.isPending ? 'animate-spin' : ''}`} />
              {syncJobs.isPending ? 'กำลังซิงค์...' : 'ซิงค์งานตอนนี้ (GET /jobs)'}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 rounded-lg bg-cream-100 p-3 text-xs sm:grid-cols-2">
          <div>
            <p className="text-espresso-500">Base URL</p>
            <p className="break-all font-mono text-espresso-900">{partner.apiBaseUrl ?? '-'}</p>
          </div>
          <div>
            <p className="text-espresso-500">รหัสอาคารเริ่มต้น (ใช้ดึงข้อมูลเจ้าของหอ)</p>
            <p className="font-mono text-espresso-900">{partner.defaultBuildingRef ?? 'ไม่ระบุ'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-espresso-500">Webhook URL สำหรับตั้งค่าฝั่งหอพัก (ไม่บังคับ — ตอบ 200 แล้วยืนยันผ่าน GET /jobs/:id)</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-white px-2 py-1 text-espresso-900">{webhookEndpoint}</code>
              <Button variant="ghost" className="shrink-0 px-2 py-1 text-xs" onClick={copyWebhook}>
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />} คัดลอก
              </Button>
            </div>
            <p className="mt-1 text-espresso-500">
              ถ้ารันเว็บในเครื่อง (localhost) หอพักจะยิง webhook เข้ามาไม่ได้ แต่ระบบจะดึงงานให้อัตโนมัติทุก 1 นาทีและกด "ซิงค์งานตอนนี้" ได้ตลอด
            </p>
          </div>
        </div>

        <ErrorText error={checkVendor.error ?? syncJobs.error} />

        {syncResult && (
          <div className="rounded-lg border border-line bg-cream-50 p-3 text-sm">
            พบงานฝั่งหอพักทั้งหมด <b>{syncResult.total}</b> งาน · นำเข้าใหม่ <b>{syncResult.created}</b> · อัปเดต <b>{syncResult.updated}</b> · ยกเลิก <b>{syncResult.cancelled}</b>
          </div>
        )}

        {vendorInfo?.vendor && (
          <div className="space-y-3 rounded-lg border border-line p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{vendorInfo.vendor.name}</p>
                <p className="text-xs text-espresso-500">
                  ผู้ติดต่อ: {vendorInfo.vendor.contact_name ?? '-'} · {vendorInfo.vendor.phone ?? '-'}
                </p>
              </div>
              <Badge tone="success">
                สัญญา{vendorInfo.vendor.contract_type === 'yearly' ? 'รายปี' : 'รายเดือน'} · {formatCurrency(vendorInfo.vendor.contract_fee)}/{vendorInfo.vendor.contract_fee_period === 'year' ? 'ปี' : 'เดือน'}
              </Badge>
            </div>
            <p className="text-xs text-espresso-500">
              อายุสัญญา: {formatDate(vendorInfo.vendor.contract_start)} – {formatDate(vendorInfo.vendor.contract_end)}
              {vendorInfo.vendor.specialties?.length ? ` · ความเชี่ยวชาญ: ${vendorInfo.vendor.specialties.join(', ')}` : ''}
            </p>
            {vendorInfo.jobSummary && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(vendorInfo.jobSummary).map(([k, v]) => (
                  <Badge key={k} tone={k === 'sent' && v > 0 ? 'warning' : 'neutral'}>
                    {REMOTE_STATUS_LABEL[k] ?? k}: {v}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">ประวัติการซิงค์และส่งสถานะ (ล่าสุด 50 รายการ)</h2>
          <PlugZap className="h-4 w-4 text-espresso-400" />
        </div>
        <QueryState query={logs}>
          {!logs.data?.length && <p className="text-sm text-espresso-500">ยังไม่มีประวัติการเชื่อมต่อ</p>}
          <ul className="space-y-2">
            {logs.data?.map((l) => {
              const dir = DIRECTION_LABEL[l.direction] ?? { label: l.direction, tone: 'neutral' as Tone };
              return (
                <li key={l.logId} className="rounded-lg border border-line p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={dir.tone}>{dir.label}</Badge>
                    <Badge tone={l.status === 'OK' ? 'success' : 'danger'}>{l.httpStatus ?? l.status}</Badge>
                    <span className="font-mono text-espresso-900">{l.action}</span>
                    <span className="ml-auto text-espresso-500">{formatDateTime(l.createdAt)}</span>
                  </div>
                  {l.errorMessage && <p className="mt-1 text-danger">{l.errorMessage}</p>}
                  {l.detail && (
                    <pre className="mt-1.5 overflow-x-auto rounded bg-cream-100 p-2 text-[11px]">{JSON.stringify(l.detail, null, 2)}</pre>
                  )}
                </li>
              );
            })}
          </ul>
        </QueryState>
      </Card>
    </div>
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

function PartnerFormModal({
  partner,
  onClose,
  onCreated,
}: {
  partner?: Partner;
  onClose: () => void;
  onCreated: (res: { partnerId: number; apiKey: string; webhookSecret: string }, mode: IntegrationMode) => void;
}) {
  const isEdit = Boolean(partner);
  const customers = useUsers('USER');
  const create = usePartnerMutation(partnerService.create);
  const update = usePartnerMutation(partnerService.update);

  const [integrationMode, setMode] = useState<IntegrationMode>(partner?.integrationMode ?? 'REPAIR_API_V1');
  const [name, setName] = useState(partner?.name ?? '');
  const [ownerUserId, setOwner] = useState(partner ? String(partner.ownerUserId) : '');
  const [apiBaseUrl, setApiBaseUrl] = useState(partner?.apiBaseUrl ?? DEFAULT_REPAIR_API_URL);
  const [outboundApiKey, setOutboundApiKey] = useState('');
  const [defaultBuildingRef, setBuildingRef] = useState(partner?.defaultBuildingRef ?? '');
  const [defaultBuildingName, setBuildingName] = useState(partner?.defaultBuildingName ?? '');
  const [defaultBuildingAddress, setBuildingAddress] = useState(partner?.defaultBuildingAddress ?? '');
  const [webhookUrl, setWebhookUrl] = useState(partner?.webhookUrl ?? '');
  const [syncEnabled, setSyncEnabled] = useState(partner?.syncEnabled ?? true);
  const [isActive, setIsActive] = useState(partner ? Boolean(partner.isActive) : true);

  const isRepair = integrationMode === 'REPAIR_API_V1';
  const busy = create.isPending || update.isPending;
  const missingKey = isRepair && (!apiBaseUrl.trim() || (!isEdit && !outboundApiKey.trim()) || (isEdit && !partner?.hasOutboundKey && !outboundApiKey.trim()));
  const disabled = !name.trim() || !ownerUserId || missingKey || busy;

  const submit = () => {
    if (isEdit && partner) {
      update.mutate(
        [
          partner.partnerId,
          {
            name,
            ownerUserId: Number(ownerUserId),
            integrationMode,
            apiBaseUrl: apiBaseUrl || undefined,
            ...(outboundApiKey.trim() ? { outboundApiKey: outboundApiKey.trim() } : {}),
            defaultBuildingRef,
            defaultBuildingName,
            defaultBuildingAddress,
            webhookUrl,
            syncEnabled,
            isActive,
          },
        ],
        { onSuccess: onClose },
      );
      return;
    }
    create.mutate(
      [
        {
          name,
          ownerUserId: Number(ownerUserId),
          integrationMode,
          apiBaseUrl: isRepair ? apiBaseUrl : apiBaseUrl || undefined,
          outboundApiKey: outboundApiKey.trim() || undefined,
          defaultBuildingRef: defaultBuildingRef || undefined,
          defaultBuildingName: defaultBuildingName || undefined,
          defaultBuildingAddress: defaultBuildingAddress || undefined,
          webhookUrl: webhookUrl || undefined,
          syncEnabled,
        },
      ],
      { onSuccess: (r) => { onClose(); onCreated(r, integrationMode); } },
    );
  };

  return (
    <Modal
      open
      wide
      title={isEdit ? `ตั้งค่าพาร์ทเนอร์: ${partner!.name}` : 'เพิ่มพาร์ทเนอร์'}
      onClose={onClose}
      footer={
        <Button disabled={disabled} onClick={submit}>
          {isEdit ? 'บันทึกการตั้งค่า' : isRepair ? 'บันทึกการเชื่อมต่อ' : 'สร้างและออก API key'}
        </Button>
      }
    >
      <div className="space-y-3">
        <Select
          label="รูปแบบการเชื่อมต่อ"
          value={integrationMode}
          onChange={(e) => {
            const next = e.target.value as IntegrationMode;
            setMode(next);
            if (next === 'REPAIR_API_V1' && !apiBaseUrl.trim()) setApiBaseUrl(DEFAULT_REPAIR_API_URL);
          }}
          options={[
            { value: 'REPAIR_API_V1', label: 'Repair API v1 — เชื่อมเว็บหอพักเพื่อน (ดึงงาน & ส่งสถานะกลับ)' },
            { value: 'PARTNER_PUSH', label: 'Partner Push — พาร์ทเนอร์ส่งงานเข้ามาหา RenoCare (เช่น DormBook)' },
          ]}
        />
        <Input
          label="ชื่อระบบพาร์ทเนอร์ / หอพัก"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isRepair ? 'เช่น หอพักเพื่อน (Ayasakimioweb)' : 'เช่น DormBook'}
        />
        <Select
          label="บัญชีลูกค้าตัวแทน (เจ้าของงานในระบบ RenoCare)"
          value={ownerUserId}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="เลือกบัญชี"
          options={(customers.data ?? []).map((u) => ({ value: u.userId, label: `${u.fullName} (${u.email})` }))}
        />

        {isRepair ? (
          <>
            <Input
              label="Repair API Base URL"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder={DEFAULT_REPAIR_API_URL}
              className="font-mono text-xs"
            />
            <Input
              label={isEdit && partner?.hasOutboundKey ? `API Key จากหอพัก (X-Repair-Api-Key) — ปัจจุบัน ${partner.outboundKeyPrefix}` : 'API Key จากหอพัก (X-Repair-Api-Key)'}
              type="password"
              value={outboundApiKey}
              onChange={(e) => setOutboundApiKey(e.target.value)}
              placeholder={isEdit && partner?.hasOutboundKey ? 'เว้นว่างถ้าต้องการใช้คีย์เดิม' : 'วาง API Key ที่ได้จากเจ้าหน้าที่หอพัก'}
              className="font-mono text-xs"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="รหัสอาคารเริ่มต้น (ไม่บังคับ)"
                value={defaultBuildingRef}
                onChange={(e) => setBuildingRef(e.target.value)}
                placeholder="ใช้เรียก GET /buildings/:ref/owner"
              />
              <Input
                label="ชื่อหอพัก/อาคาร (ไม่บังคับ)"
                value={defaultBuildingName}
                onChange={(e) => setBuildingName(e.target.value)}
                placeholder="ใช้แสดงในรายการงาน"
              />
            </div>
            <Textarea
              label="ที่อยู่หอพัก (ไม่บังคับ)"
              rows={2}
              value={defaultBuildingAddress}
              onChange={(e) => setBuildingAddress(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-espresso-700">
              <input type="checkbox" checked={syncEnabled} onChange={(e) => setSyncEnabled(e.target.checked)} />
              ซิงค์งานใหม่อัตโนมัติทุก 1 นาที (GET /jobs)
            </label>
          </>
        ) : (
          <>
            <Input
              label="Webhook URL (ถ้ามี)"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://partner.example.com/webhooks/renocare"
            />
            <Input
              label="Outbound API Base URL (ไม่บังคับ)"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="ใช้ดึงข้อมูลเจ้าของหอในงาน STRUCTURAL"
            />
            <Input
              label="Outbound API Key (ไม่บังคับ)"
              type="password"
              value={outboundApiKey}
              onChange={(e) => setOutboundApiKey(e.target.value)}
              placeholder={isEdit && partner?.hasOutboundKey ? 'เว้นว่างถ้าใช้คีย์เดิม' : ''}
            />
          </>
        )}

        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-espresso-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            เปิดใช้งานพาร์ทเนอร์นี้
          </label>
        )}
        <ErrorText error={create.error ?? update.error} />
      </div>
    </Modal>
  );
}
