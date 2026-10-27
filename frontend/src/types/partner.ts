import type { JobStatus, JobType, Priority, UnitType } from './job';

export interface Partner {
  partnerId: number;
  name: string;
  ownerUserId: number;
  apiKeyPrefix: string;
  webhookUrl: string | null;
  isActive: number;
  createdAt: string;
  totalJobs: number;
  failedWebhooks: number;
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
