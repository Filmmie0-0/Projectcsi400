import type { JobStatus, JobType, Priority, UnitType } from './job';

export type IntegrationMode = 'PARTNER_PUSH' | 'REPAIR_API_V1';

export interface Partner {
  partnerId: number;
  name: string;
  ownerUserId: number;
  integrationMode: IntegrationMode;
  apiKeyPrefix: string;
  webhookUrl: string | null;
  apiBaseUrl: string | null;
  hasOutboundKey: boolean;
  outboundKeyPrefix: string | null;
  defaultBuildingRef: string | null;
  defaultBuildingName: string | null;
  defaultBuildingAddress: string | null;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  isActive: number;
  createdAt: string;
  totalJobs: number;
  failedWebhooks: number;
}

export interface PartnerCreateInput {
  name: string;
  ownerUserId: number;
  integrationMode?: IntegrationMode;
  webhookUrl?: string;
  apiBaseUrl?: string;
  outboundApiKey?: string;
  defaultBuildingRef?: string;
  defaultBuildingName?: string;
  defaultBuildingAddress?: string;
  syncEnabled?: boolean;
}

export interface PartnerUpdateInput {
  name?: string;
  ownerUserId?: number;
  integrationMode?: IntegrationMode;
  webhookUrl?: string;
  apiBaseUrl?: string;
  outboundApiKey?: string;
  defaultBuildingRef?: string;
  defaultBuildingName?: string;
  defaultBuildingAddress?: string;
  syncEnabled?: boolean;
  isActive?: boolean;
}

export interface RemoteVendorResponse {
  vendor: {
    name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    specialties: string[];
    specialty_other: string | null;
    contract_type: string;
    contract_start: string;
    contract_end: string;
    contract_fee: number;
    contract_fee_period: string;
  } | null;
  jobSummary: Record<string, number> | null;
}

export interface PartnerSyncResult {
  total: number;
  created: number;
  updated: number;
  cancelled: number;
  unchanged: number;
  skipped: number;
  syncedAt?: string;
  inProgress?: boolean;
}

export interface PartnerSyncLog {
  logId: number;
  partnerId: number;
  jobId: number | null;
  remoteJobId: number | null;
  direction: 'INBOUND_POLL' | 'INBOUND_WEBHOOK' | 'OUTBOUND_STATUS' | 'OUTBOUND_VENDOR' | 'OUTBOUND_OWNER';
  action: string;
  status: 'OK' | 'ERROR';
  httpStatus: number | null;
  detail: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface WebhookDelivery {
  deliveryId: number;
  jobId: number | null;
  event: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

// ── Partner API v1 (สัญญาระหว่างระบบเรากับระบบจองห้องพักของเพื่อน) ──
export interface PartnerJobRequest {
  externalRef: string;
  jobType: JobType;
  building: { externalRef: string; name: string; address: string };
  unit: { externalRef?: string; code: string; unitType: UnitType; floor?: string };
  title: string;
  description?: string;
  priority?: Priority;
  preferredDate?: string;
  contact?: { name?: string; phone?: string };
}

export interface PartnerJobView {
  jobCode: string;
  externalRef: string;
  jobType: JobType;
  title: string;
  status: JobStatus;
  createdAt: string;
  completedAt: string | null;
  progressPct?: number;
}

// webhook ที่ระบบจองจำลองใน gateway ได้รับ
export interface InboxEvent {
  receivedAt: string;
  signatureValid: boolean;
  body: { event: string; jobCode: string; externalRef: string; [k: string]: unknown };
}
