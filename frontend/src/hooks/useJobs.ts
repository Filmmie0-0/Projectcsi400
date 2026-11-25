import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jobService } from '../services/jobService';
import type { JobDetail } from '../types/job';

export const jobKeys = {
  all: ['jobs'] as const,
  list: (params?: object) => ['jobs', 'list', params ?? {}] as const,
  detail: (id: number) => ['jobs', 'detail', id] as const,
  buildings: ['jobs', 'buildings'] as const,
  contracts: ['jobs', 'contracts'] as const,
  invoices: ['jobs', 'invoices'] as const,
  summary: ['jobs', 'summary'] as const,
};

export const useJobs = (params?: { status?: string; type?: string }) =>
  useQuery({ queryKey: jobKeys.list(params), queryFn: () => jobService.listJobs(params) });
export const useJob = (id: number) =>
  useQuery({ queryKey: jobKeys.detail(id), queryFn: () => jobService.getJob(id), enabled: id > 0 });
export const useBuildings = () => useQuery({ queryKey: jobKeys.buildings, queryFn: jobService.listBuildings });
export const useContracts = () => useQuery({ queryKey: jobKeys.contracts, queryFn: jobService.listContracts });
export const useInvoices = () => useQuery({ queryKey: jobKeys.invoices, queryFn: () => jobService.listInvoices() });
export const useAdminSummary = () => useQuery({ queryKey: jobKeys.summary, queryFn: jobService.adminSummary });

// ข้อความ toast เมื่อทำสำเร็จ (ตัวที่ไม่อยู่ในนี้ใช้ "บันทึกเรียบร้อย")
type Msg = string | ((args: never[]) => string);
const S = jobService;
const SUCCESS = new Map<unknown, Msg>([
  [S.createBuilding, 'เพิ่มอาคารแล้ว'],
  [S.addUnit, 'เพิ่มห้อง/พื้นที่แล้ว'],
  [S.createJob, 'แจ้งงานเรียบร้อย'],
  [S.assign, 'บันทึกทีมช่างแล้ว'],
  [S.submitSurvey, 'ส่งผลประเมินแล้ว'],
  [S.start, 'เริ่มงานแล้ว'],
  [S.addWorkLog, 'บันทึกงานประจำวันแล้ว'],
  [S.complete, 'ปิดงานเรียบร้อย'],
  [S.cancel, 'ยกเลิกงานแล้ว'],
  [S.syncRemote, 'ซิงค์ข้อมูลกับหอพักเรียบร้อย'],
  [S.ownerDecision, (a) => ((a as unknown[])[1] === 'APPROVED' ? 'บันทึกว่าเจ้าของหออนุมัติแล้ว' : 'บันทึกว่าเจ้าของหอไม่อนุมัติ งานถูกยกเลิก')],
  [S.refreshOwnerContact, 'อัปเดตข้อมูลเจ้าของหอแล้ว'],
  [S.saveOwnerContact, 'บันทึกข้อมูลเจ้าของหอแล้ว'],
  [S.createContract, 'สร้างร่างสัญญาแล้ว'],
  [S.deleteContract, 'ลบร่างสัญญาแล้ว'],
  [S.sendContract, 'ส่งสัญญาให้ลูกค้าแล้ว'],
  [S.uploadContractFile, 'แนบไฟล์สัญญาแล้ว'],
  [S.deleteContractFile, 'ลบไฟล์สัญญาแล้ว'],
  [S.signContract, 'ส่งสัญญาที่เซ็นแล้วเรียบร้อย'],
  [S.rejectContract, 'ปฏิเสธสัญญาแล้ว'],
  [S.payInvoice, 'ส่งหลักฐานการชำระแล้ว รอตรวจสอบ'],
  [S.verifyInvoice, (a) => ((a as unknown[])[1] ? 'ยืนยันการชำระแล้ว' : 'ตีกลับการชำระแล้ว')],
]);

// ทุก action ของงานกระทบหลายหน้าจอ (รายการ/สัญญา/บิล) จึง invalidate ['jobs', ...] ทั้งหมด
// action ที่คืน JobDetail ใส่ลง cache ของหน้ารายละเอียดทันที
export function useJobMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const qc = useQueryClient();
  const msg = SUCCESS.get(fn);
  return useMutation({
    mutationFn: (args: A) => fn(...args),
    meta: { success: typeof msg === 'function' ? (v: unknown) => msg(v as never[]) : msg },
    onSuccess: (result) => {
      const job = result as Partial<JobDetail> | null;
      if (job && typeof job === 'object' && 'jobId' in job && 'statusLogs' in job) {
        qc.setQueryData(jobKeys.detail(job.jobId as number), job);
      }
      return qc.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}
