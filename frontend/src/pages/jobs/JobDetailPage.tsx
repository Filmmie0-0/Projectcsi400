import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, PlugZap, RefreshCw } from 'lucide-react';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/common/StatusBadge';
import QueryState, { ErrorText } from '../../components/common/QueryState';
import JobStatusStepper from '../../components/features/job/JobStatusStepper';
import AssignTechnicianModal from '../../components/features/job/AssignTechnicianModal';
import SurveySection from '../../components/features/job/SurveySection';
import ContractSection from '../../components/features/job/ContractSection';
import OwnerApprovalCard from '../../components/features/job/OwnerApprovalCard';
import WorkLogSection from '../../components/features/job/WorkLogSection';
import JobRequisitionSection from '../../components/features/inventory/JobRequisitionSection';
import { JOB_STATUS, JOB_TYPE, PRIORITY, UNIT_TYPE } from '../../constants/labels';
import { useJob, useJobMutation } from '../../hooks/useJobs';
import { jobService } from '../../services/jobService';
import { useAuthStore } from '../../store/authStore';
import { confirmDialog, promptDialog } from '../../store/dialogStore';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import type { JobDetail } from '../../types/job';

// หน้าเดียวใช้ทุก role: แต่ละ section ตัดสินใจเองว่าจะแสดงปุ่มอะไรตาม role + สถานะงาน
export default function JobDetailPage() {
  const id = Number(useParams().id);
  const user = useAuthStore((s) => s.user!);
  const job = useJob(id);

  return (
    <QueryState query={job}>
      {job.data && (
        <div className="space-y-6">
          <Link to="/jobs" className="inline-flex items-center gap-1 text-sm text-espresso-500 hover:text-espresso-900">
            <ArrowLeft className="h-4 w-4" /> กลับไปรายการงาน
          </Link>
          <Header job={job.data} />
          <Card><JobStatusStepper status={job.data.status} /></Card>
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-6">
              <SurveySection job={job.data} role={user.role} userId={user.userId} />
              <ContractSection job={job.data} role={user.role} />
              <WorkLogSection job={job.data} role={user.role} userId={user.userId} />
              {user.role !== 'USER' && <JobRequisitionSection job={job.data} role={user.role} userId={user.userId} />}
            </div>
            <div className="space-y-6">
              <RepairApiCard job={job.data} role={user.role} />
              <OwnerApprovalCard job={job.data} role={user.role} />
              <Actions job={job.data} />
              <InfoCard job={job.data} />
              <History job={job.data} />
            </div>
          </div>
        </div>
      )}
    </QueryState>
  );
}

function Header({ job }: { job: JobDetail }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono text-espresso-500">{job.jobCode}</span>
        <Badge tone="brand">{JOB_TYPE[job.jobType]}</Badge>
        {job.priority !== 'NORMAL' && <Badge tone={PRIORITY[job.priority].tone}>{PRIORITY[job.priority].label}</Badge>}
        {job.source === 'PARTNER' && <Badge tone="info"><PlugZap className="mr-1 h-3 w-3" />{job.partnerName} · {job.externalRef}</Badge>}
        <StatusBadge kind="job" status={job.status} />
      </div>
      <h1 className="mt-2 text-2xl font-semibold">{job.title}</h1>
      <p className="mt-1 text-sm text-espresso-500">{job.buildingName} · {UNIT_TYPE[job.unitType]} {job.unitCode}</p>
    </div>
  );
}

// ปุ่มเปลี่ยนสถานะงาน (กติกาเดียวกับ backend: services/job-service/src/routes/jobs.js)
function Actions({ job }: { job: JobDetail }) {
  const user = useAuthStore((s) => s.user!);
  const [assignOpen, setAssignOpen] = useState(false);
  const start = useJobMutation(jobService.start);
  const complete = useJobMutation(jobService.complete);
  const cancel = useJobMutation(jobService.cancel);
  const isLead = job.assignments.some((a) => a.technicianId === user.userId && a.isLead);
  const isAdmin = user.role === 'ADMIN';
  const open = !['COMPLETED', 'CANCELLED'].includes(job.status);
  const hasPendingContract = job.contracts.some((c) => ['DRAFT', 'SENT'].includes(c.status));
  const canStart =
    isLead &&
    job.ownerApproval !== 'PENDING' &&
    (job.status === 'CONTRACTED' || (Boolean(job.remoteJobId) && ['SURVEY_ASSIGNED', 'SURVEYED'].includes(job.status) && !hasPendingContract));
  const isRejectableRemote = Boolean(job.remoteJobId && job.status === 'NEW' && job.remoteStatus === 'sent');

  const buttons = [
    isAdmin && open && (
      <Button key="assign" variant={job.status === 'NEW' ? 'primary' : 'secondary'} onClick={() => setAssignOpen(true)}>
        {job.status === 'NEW' ? 'มอบหมายช่าง & นัดประเมิน' : 'ปรับทีมช่าง'}
      </Button>
    ),
    canStart && (
      <Button key="start" onClick={() => start.mutate([job.jobId])} disabled={start.isPending}>
        {job.remoteJobId && job.status !== 'CONTRACTED' ? 'เริ่มซ่อมงาน' : 'เริ่มงาน'}
      </Button>
    ),
    isLead && job.status === 'IN_PROGRESS' && (
      <Button
        key="complete"
        onClick={async () => {
          if (job.remoteJobId) {
            const note = await promptDialog({
              title: 'ส่งมอบงาน / ปิดงานซ่อม?',
              message: `ยืนยันว่างาน ${job.jobCode} เสร็จเรียบร้อยแล้ว (จะส่งสถานะ done ไปยังระบบหอพัก)`,
              input: { label: 'บันทึกการซ่อมถึงหอพัก', placeholder: 'เช่น เติมน้ำยาและล้างท่อน้ำทิ้งแล้ว' },
              confirmText: 'ปิดงานซ่อมเสร็จ',
            });
            if (note !== null) complete.mutate([job.jobId, note || undefined]);
            return;
          }
          if (await confirmDialog({ title: 'ส่งมอบงาน / ปิดงาน?', message: `ยืนยันว่างาน ${job.jobCode} เสร็จเรียบร้อยและส่งมอบให้ลูกค้าแล้ว`, confirmText: 'ส่งมอบงาน' })) {
            complete.mutate([job.jobId]);
          }
        }}
        disabled={complete.isPending}
      >
        ส่งมอบงาน / ปิดงาน
      </Button>
    ),
    isAdmin && job.status === 'SURVEYED' && (
      <Button
        key="close-no-repair"
        variant={noRepair(job) ? 'primary' : 'secondary'}
        onClick={async () => (await confirmDialog({ title: 'ปิดงานโดยไม่ทำสัญญา?', message: 'งานจะเปลี่ยนเป็น "เสร็จสิ้น" และไม่มีการร่างสัญญา', confirmText: 'ปิดงาน' })) && complete.mutate([job.jobId, job.jobType === 'INSPECTION' ? 'ส่งผลตรวจห้องแล้ว ลูกค้าไม่ซ่อม' : 'ประเมินแล้ว ไม่มีงานซ่อม'])}
        disabled={complete.isPending}
      >
        ปิดงาน (ไม่ซ่อม)
      </Button>
    ),
    ((isAdmin && open) || (user.role === 'USER' && ['NEW', 'SURVEY_ASSIGNED', 'SURVEYED', 'QUOTED'].includes(job.status))) && (
      <Button
        key="cancel"
        variant="ghost"
        onClick={async () => {
          const reason = await promptDialog({
            title: isRejectableRemote ? `ปฏิเสธงาน ${job.jobCode}` : `ยกเลิกงาน ${job.jobCode}`,
            message: isRejectableRemote ? 'ระบบจะส่งสถานะปฏิเสธงาน (rejected) พร้อมเหตุผลกลับไปยังหอพัก' : undefined,
            input: {
              label: isRejectableRemote ? 'เหตุผลที่ปฏิเสธงาน (จำเป็น)' : 'เหตุผลที่ยกเลิกงาน',
              placeholder: isRejectableRemote ? 'เช่น ช่างไม่ว่างจนถึงสิ้นเดือน' : undefined,
              required: isRejectableRemote,
            },
            confirmText: isRejectableRemote ? 'ปฏิเสธงาน' : 'ยกเลิกงาน',
            danger: true,
          });
          if (reason !== null) cancel.mutate([job.jobId, reason]);
        }}
      >
        {isRejectableRemote ? 'ปฏิเสธงาน' : 'ยกเลิกงาน'}
      </Button>
    ),
  ].filter(Boolean);

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">สิ่งที่ต้องทำ</h2>
      <p className="text-sm text-espresso-500">{nextStepHint(job, user.role)}</p>
      <div className="flex flex-col gap-2">{buttons}</div>
      <ErrorText error={start.error ?? complete.error ?? cancel.error} />
      {assignOpen && <AssignTechnicianModal job={job} open onClose={() => setAssignOpen(false)} />}
    </Card>
  );
}

const REMOTE_STATUS_TH: Record<string, { label: string; tone: 'neutral' | 'warning' | 'info' | 'brand' | 'success' | 'danger' }> = {
  sent: { label: 'sent · รอตอบรับ', tone: 'warning' },
  accepted: { label: 'accepted · รับงานแล้ว', tone: 'info' },
  in_progress: { label: 'in_progress · กำลังซ่อม', tone: 'brand' },
  done: { label: 'done · ซ่อมเสร็จ', tone: 'success' },
  rejected: { label: 'rejected · ปฏิเสธงาน', tone: 'danger' },
  cancelled: { label: 'cancelled · หอพักยกเลิก', tone: 'neutral' },
};

function RepairApiCard({ job, role }: { job: JobDetail; role: string }) {
  const sync = useJobMutation(jobService.syncRemote);
  if (!job.remoteJobId) return null;
  const payload = (job.remotePayload ?? {}) as Record<string, unknown>;
  const st = REMOTE_STATUS_TH[job.remoteStatus ?? ''] ?? { label: job.remoteStatus ?? '-', tone: 'neutral' as const };
  const canSync = role === 'ADMIN' || role === 'TECHNICIAN';

  return (
    <Card className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">สถานะฝั่งหอพัก #{job.remoteJobId}</h2>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-espresso-600">
        {typeof payload.category === 'string' && (
          <div><span className="text-espresso-400">หมวด:</span> {payload.category}</div>
        )}
        {typeof payload.preferred_time === 'string' && (
          <div><span className="text-espresso-400">เวลาสะดวก:</span> {payload.preferred_time}</div>
        )}
        {typeof payload.sent_by_name === 'string' && (
          <div><span className="text-espresso-400">ผู้ส่งงาน:</span> {payload.sent_by_name}</div>
        )}
        {typeof payload.scheduled_at === 'string' && (
          <div><span className="text-espresso-400">นัดฝั่งหอพัก:</span> {formatDateTime(payload.scheduled_at)}</div>
        )}
      </div>
      {job.remoteDetailsUpdatedAt && (
        <p className="text-xs text-espresso-500">หอพักแก้ไขข้อมูลล่าสุด: {formatDateTime(job.remoteDetailsUpdatedAt)}</p>
      )}
      {job.remoteSyncedAt && (
        <p className="text-xs text-espresso-500">ซิงค์ล่าสุด: {formatDateTime(job.remoteSyncedAt)}</p>
      )}
      {job.remoteSyncError && (
        <div className="rounded-lg bg-danger-soft p-2.5 text-xs text-danger">
          <p className="font-medium">ซิงค์กลับหอพักไม่สำเร็จ:</p>
          <p>{job.remoteSyncError}</p>
        </div>
      )}
      {canSync && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="text-xs" onClick={() => sync.mutate([job.jobId, 'pull'])} disabled={sync.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} /> ดึงล่าสุด
          </Button>
          {job.remoteSyncError && (
            <Button className="text-xs" onClick={() => sync.mutate([job.jobId, 'push'])} disabled={sync.isPending}>
              ส่งสถานะกลับอีกครั้ง
            </Button>
          )}
        </div>
      )}
      <ErrorText error={sync.error} />
    </Card>
  );
}

// ผลประเมินครั้งแรกบอกว่าไม่ต้องซ่อม → ไม่มีสัญญาให้ร่าง
function noRepair(job: JobDetail) {
  return job.surveys.some((s) => s.surveyType === 'INITIAL' && s.status === 'SUBMITTED' && s.needRepair === 0);
}

function nextStepHint(job: JobDetail, role: string) {
  if (job.ownerApproval === 'PENDING' && ['SURVEYED', 'QUOTED', 'CONTRACTED'].includes(job.status)) {
    return ({ ADMIN: 'โทรขออนุมัติจากเจ้าของหอ แล้วบันทึกผลในการ์ด "อนุมัติจากเจ้าของหอ" ก่อนส่งสัญญา', USER: 'รอเจ้าของหออนุมัติงาน', TECHNICIAN: 'รอเจ้าของหออนุมัติงาน' } as Record<string, string>)[role];
  }
  if (job.status === 'SURVEYED' && noRepair(job)) {
    return ({ ADMIN: 'ช่างประเมินว่าไม่ต้องซ่อม — กด "ปิดงาน (ไม่ซ่อม)"', USER: 'ช่างประเมินว่าไม่ต้องซ่อม รอแอดมินปิดงาน', TECHNICIAN: 'ประเมินว่าไม่ต้องซ่อม รอแอดมินปิดงาน' } as Record<string, string>)[role];
  }
  const hints: Partial<Record<JobDetail['status'], Record<string, string>>> = {
    NEW: { ADMIN: 'มอบหมายช่างและนัดวันประเมินหน้างาน', USER: 'รอแอดมินนัดช่างเข้าประเมิน' },
    SURVEY_ASSIGNED: {
      TECHNICIAN: job.remoteJobId ? 'เข้าหน้างานตามนัด: บันทึกผลประเมิน หรือกด "เริ่มซ่อมงาน" เพื่อแจ้งหอพักว่ากำลังซ่อม' : 'เข้าหน้างานตามนัดแล้วบันทึกผลประเมิน',
      ADMIN: 'รอช่างส่งผลประเมินหรือเริ่มซ่อมงาน',
      USER: 'ช่างจะเข้าประเมินตามวันนัด',
    },
    SURVEYED: { ADMIN: 'ร่างสัญญาจากผลประเมินแล้วส่งให้ลูกค้า', USER: 'รอแอดมินส่งสัญญา', TECHNICIAN: job.remoteJobId ? 'กด "เริ่มซ่อมงาน" หรือรอทำสัญญา' : 'รอทำสัญญา' },
    QUOTED: { USER: 'ตรวจสอบและลงนามสัญญา', ADMIN: 'รอลูกค้าลงนาม', TECHNICIAN: 'รอลูกค้าลงนาม' },
    CONTRACTED: { TECHNICIAN: 'เบิกวัสดุแล้วกดเริ่มงาน (หัวหน้าช่าง)', ADMIN: 'รอหัวหน้าช่างเริ่มงาน', USER: 'ชำระงวดแรกตามสัญญา' },
    IN_PROGRESS: { TECHNICIAN: 'บันทึกงานรายวัน พบงานเพิ่มให้กด "แจ้งงานเพิ่ม"', ADMIN: 'ติดตามความคืบหน้า อนุมัติใบเบิก (หัวหน้าช่างเป็นคนส่งมอบงาน)', USER: 'ติดตามความคืบหน้า' },
  };
  return hints[job.status]?.[role] ?? JOB_STATUS[job.status].label;
}

function InfoCard({ job }: { job: JobDetail }) {
  const rows: [string, string | null][] = [
    ['สถานที่', `${job.buildingName} — ${job.address}`],
    ['พื้นที่', `${UNIT_TYPE[job.unitType]} ${job.unitCode}${job.floor ? ` ชั้น ${job.floor}` : ''}${job.sizeSqm ? ` · ${job.sizeSqm} ตร.ม.` : ''}`],
    ['ผู้ติดต่อ', [job.contactName, job.contactPhone].filter(Boolean).join(' · ') || null],
    ['วันที่ต้องการ', formatDate(job.preferredDate)],
    ['ทีมช่าง', job.assignments.map((a) => `${a.technicianName}${a.isLead ? ' (หัวหน้า)' : ''}`).join(', ') || null],
    ['รายละเอียด', job.description],
  ];
  return (
    <Card className="space-y-3 text-sm">
      <h2 className="font-semibold">ข้อมูลงาน</h2>
      {rows.map(([k, v]) => (
        <div key={k}>
          <p className="text-xs text-espresso-500">{k}</p>
          <p>{v || '-'}</p>
        </div>
      ))}
    </Card>
  );
}

function History({ job }: { job: JobDetail }) {
  return (
    <Card className="text-sm">
      <h2 className="mb-3 font-semibold">ประวัติสถานะ</h2>
      <ol className="space-y-3 border-l border-line pl-4">
        {[...job.statusLogs].reverse().map((l) => (
          <li key={l.logId} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-walnut-300" />
            <p className="font-medium">{JOB_STATUS[l.toStatus].label}</p>
            <p className="text-xs text-espresso-500">
              {formatDateTime(l.createdAt)}{l.changedBy === null ? ' · โดยระบบพาร์ทเนอร์' : ''}
            </p>
            {l.remark && <p className="text-xs text-espresso-700">{l.remark}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
