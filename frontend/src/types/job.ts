// ตรงกับ database/services/02_job_db.sql (API ส่งเป็น camelCase)
export type JobType = 'INSPECTION' | 'RENOVATION';
export type JobSource = 'DIRECT' | 'PARTNER';
export type Priority = 'LOW' | 'NORMAL' | 'URGENT';
export type JobStatus =
  | 'NEW' | 'SURVEY_ASSIGNED' | 'SURVEYED' | 'QUOTED' | 'CONTRACTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type UnitType = 'ROOM' | 'COMMON' | 'UNDER_BUILDING';
export type ItemCondition = 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING';
export type ItemAction = 'NONE' | 'REPAIR' | 'REPLACE';
export type BillingType = 'DAILY' | 'MONTHLY';
export type ContractStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'REJECTED' | 'CANCELLED';
export type InvoiceStatus = 'UNPAID' | 'PENDING_VERIFY' | 'PAID';

export interface Unit {
  unitId: number;
  buildingId: number;
  unitType: UnitType;
  code: string;
  floor: string | null;
  sizeSqm: number | null;
}

export interface Building {
  buildingId: number;
  name: string;
  address: string;
  partnerId: number | null;
  units: Unit[];
}

export interface UnitInput {
  unitType: UnitType;
  code: string;
  floor?: string;
  sizeSqm?: number;
}

export interface JobListItem {
  jobId: number;
  jobCode: string;
  jobType: JobType;
  source: JobSource;
  title: string;
  priority: Priority;
  status: JobStatus;
  preferredDate: string | null;
  createdAt: string;
  unitCode: string;
  unitType: UnitType;
  buildingName: string;
  partnerName: string | null;
  leadTechnician: string | null;
  surveyDate: string | null;
  progressPct: number | null;
}

export interface Assignment {
  technicianId: number;
  technicianName: string;
  isLead: number;
}

export interface SurveyItem {
  itemId?: number;
  area: string;
  item: string;
  itemCondition: ItemCondition;
  action: ItemAction;
  estCost: number;
  note?: string | null;
}

export interface Survey {
  surveyId: number;
  surveyType: 'INITIAL' | 'ADDITIONAL';
  technicianId: number;
  scheduledDate: string | null;
  status: 'SCHEDULED' | 'SUBMITTED';
  summary: string | null;
  estDays: number | null;
  needRepair: number | null;
  submittedAt: string | null;
  items: SurveyItem[];
}

export interface ContractItem {
  itemId?: number;
  materialId: number | null;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal?: number;
}

export interface Invoice {
  invoiceId: number;
  invoiceNo: string;
  contractId: number;
  installmentNo: number;
  description: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
  slipRef: string | null;
  paidAt: string | null;
  // จาก GET /invoices
  contractNo?: string;
  billingType?: BillingType;
  jobId?: number;
  jobCode?: string;
  jobTitle?: string;
}

export interface Contract {
  contractId: number;
  contractNo: string;
  jobId: number;
  surveyId: number | null;
  contractType: 'MAIN' | 'ADDENDUM';
  billingType: BillingType;
  rate: number;
  periodQty: number;
  startDate: string;
  endDate: string;
  laborAmount: number;
  materialAmount: number;
  totalAmount: number;
  terms: string | null;
  status: ContractStatus;
  signedName: string | null;
  signedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  items?: ContractItem[];
  invoices?: Invoice[];
  // จาก GET /contracts
  jobCode?: string;
  jobTitle?: string;
}

export interface ContractInput {
  jobId: number;
  surveyId?: number;
  contractType: 'MAIN' | 'ADDENDUM';
  billingType: BillingType;
  rate: number;
  periodQty: number;
  startDate: string;
  terms?: string;
  items: ContractItem[];
}

export interface WorkLog {
  logId: number;
  technicianId: number;
  technicianName: string;
  workDate: string;
  hours: number;
  progressPct: number;
  note: string;
  photoUrl: string | null;
}

export interface StatusLog {
  logId: number;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  changedBy: number | null;
  remark: string | null;
  createdAt: string;
}

export interface JobDetail {
  jobId: number;
  jobCode: string;
  jobType: JobType;
  source: JobSource;
  partnerId: number | null;
  partnerName: string | null;
  externalRef: string | null;
  requesterId: number;
  title: string;
  description: string | null;
  priority: Priority;
  preferredDate: string | null;
  contactName: string | null;
  contactPhone: string | null;
  status: JobStatus;
  completedAt: string | null;
  createdAt: string;
  unitCode: string;
  unitType: UnitType;
  floor: string | null;
  sizeSqm: number | null;
  buildingName: string;
  address: string;
  assignments: Assignment[];
  surveys: Survey[];
  contracts: Contract[];
  workLogs: WorkLog[];
  statusLogs: StatusLog[];
}

export interface JobInput {
  unitId: number;
  jobType: JobType;
  title: string;
  description?: string;
  priority: Priority;
  preferredDate?: string;
  contactName?: string;
  contactPhone?: string;
}

export interface SurveyInput {
  summary: string;
  estDays: number;
  needRepair: boolean;
  items: SurveyItem[];
}

export interface WorkLogInput {
  workDate: string;
  hours: number;
  progressPct: number;
  note: string;
  photoUrl?: string;
}

export interface AdminSummary {
  totalCustomers: number;
  totalTechnicians: number;
  newJobs: number;
  jobsInSurvey: number;
  jobsInProgress: number;
  jobsCompleted: number;
  partnerJobs: number;
  totalRevenue: number;
  invoicesToVerify: number;
  totalMaterials: number;
  lowStockMaterials: number;
  stockValue: number;
  pendingRequisitions: number;
}
