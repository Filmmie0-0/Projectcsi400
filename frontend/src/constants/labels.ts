import type { Tone } from '../components/ui/Badge';
import type {
  BillingType, ContractStatus, InvoiceStatus, ItemAction, ItemCondition, JobStatus, JobType, Priority, UnitType,
} from '../types/job';
import type { MovementType, RequisitionStatus } from '../types/inventory';

type LabelMap<T extends string> = Record<T, { label: string; tone: Tone }>;

export const JOB_STATUS: LabelMap<JobStatus> = {
  NEW: { label: 'งานใหม่', tone: 'warning' },
  SURVEY_ASSIGNED: { label: 'นัดประเมินหน้างาน', tone: 'info' },
  SURVEYED: { label: 'ประเมินแล้ว', tone: 'info' },
  QUOTED: { label: 'รอลูกค้าเซ็นสัญญา', tone: 'brand' },
  CONTRACTED: { label: 'เซ็นสัญญาแล้ว', tone: 'brand' },
  IN_PROGRESS: { label: 'กำลังดำเนินงาน', tone: 'warning' },
  COMPLETED: { label: 'เสร็จสิ้น', tone: 'success' },
  CANCELLED: { label: 'ยกเลิก', tone: 'neutral' },
};

// ลำดับขั้นสำหรับ stepper (CANCELLED แสดงแยก)
export const JOB_FLOW: JobStatus[] = ['NEW', 'SURVEY_ASSIGNED', 'SURVEYED', 'QUOTED', 'CONTRACTED', 'IN_PROGRESS', 'COMPLETED'];

export const CONTRACT_STATUS: LabelMap<ContractStatus> = {
  DRAFT: { label: 'ฉบับร่าง', tone: 'neutral' },
  SENT: { label: 'รอลูกค้าเซ็น', tone: 'warning' },
  SIGNED: { label: 'เซ็นแล้ว', tone: 'success' },
  REJECTED: { label: 'ลูกค้าปฏิเสธ', tone: 'danger' },
  CANCELLED: { label: 'ยกเลิก', tone: 'neutral' },
};

export const INVOICE_STATUS: LabelMap<InvoiceStatus> = {
  UNPAID: { label: 'ยังไม่ชำระ', tone: 'warning' },
  PENDING_VERIFY: { label: 'รอตรวจสลิป', tone: 'info' },
  PAID: { label: 'ชำระแล้ว', tone: 'success' },
};

export const REQUISITION_STATUS: LabelMap<RequisitionStatus> = {
  PENDING: { label: 'รออนุมัติ', tone: 'warning' },
  ISSUED: { label: 'จ่ายของแล้ว', tone: 'info' },
  REJECTED: { label: 'ไม่อนุมัติ', tone: 'danger' },
  CLOSED: { label: 'ปิดใบเบิก', tone: 'success' },
};

export const JOB_TYPE: Record<JobType, string> = { INSPECTION: 'ตรวจสอบห้องเช่า', RENOVATION: 'รีโนเวท/ซ่อมแซม' };
export const UNIT_TYPE: Record<UnitType, string> = { ROOM: 'ห้องเช่า', COMMON: 'พื้นที่ส่วนกลาง', UNDER_BUILDING: 'พื้นที่ใต้ตึก' };
export const PRIORITY: LabelMap<Priority> = {
  LOW: { label: 'ไม่เร่ง', tone: 'neutral' },
  NORMAL: { label: 'ปกติ', tone: 'neutral' },
  URGENT: { label: 'ด่วน', tone: 'danger' },
};
export const BILLING_TYPE: Record<BillingType, { label: string; unit: string }> = {
  DAILY: { label: 'รายวัน', unit: 'วัน' },
  MONTHLY: { label: 'รายเดือน', unit: 'เดือน' },
};
export const CONDITION: LabelMap<ItemCondition> = {
  GOOD: { label: 'ดี', tone: 'success' },
  FAIR: { label: 'พอใช้', tone: 'warning' },
  DAMAGED: { label: 'ชำรุด', tone: 'danger' },
  MISSING: { label: 'สูญหาย', tone: 'danger' },
};
export const ACTION: Record<ItemAction, string> = { NONE: 'ไม่ต้องทำ', REPAIR: 'ซ่อม', REPLACE: 'เปลี่ยนใหม่' };
export const MOVEMENT: LabelMap<MovementType> = {
  IN: { label: 'รับเข้า', tone: 'success' },
  OUT: { label: 'จ่ายออก', tone: 'warning' },
  RETURN: { label: 'คืน', tone: 'info' },
  ADJUST: { label: 'ปรับยอด', tone: 'neutral' },
};

export const toOptions = <T extends string>(map: Record<T, string | { label: string }>) =>
  (Object.entries(map) as [T, string | { label: string }][]).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }));

// งานสั้นกว่า 30 วันคิดรายวัน ยาวกว่านั้นเหมารายเดือน (แอดมินเปลี่ยนเองได้)
export const suggestBilling = (estDays: number): { billingType: BillingType; periodQty: number } =>
  estDays >= 30 ? { billingType: 'MONTHLY', periodQty: Math.ceil(estDays / 30) } : { billingType: 'DAILY', periodQty: estDays };
