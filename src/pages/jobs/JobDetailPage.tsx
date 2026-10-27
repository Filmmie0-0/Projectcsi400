import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, PlugZap } from 'lucide-react';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/common/StatusBadge';
import QueryState, { ErrorText } from '../../components/common/QueryState';
import JobStatusStepper from '../../components/features/job/JobStatusStepper';
import AssignTechnicianModal from '../../components/features/job/AssignTechnicianModal';
import SurveySection from '../../components/features/job/SurveySection';
import ContractSection from '../../components/features/job/ContractSection';
import WorkLogSection from '../../components/features/job/WorkLogSection';
import JobRequisitionSection from '../../components/features/inventory/JobRequisitionSection';
import { JOB_STATUS, JOB_TYPE, PRIORITY, UNIT_TYPE } from '../../constants/labels';
import { useJob, useJobMutation } from '../../hooks/useJobs';
import { jobService } from '../../services/jobService';
import { useAuthStore } from '../../store/authStore';
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

  const buttons = [
    isAdmin && open && (
      <Button key="assign" variant={job.status === 'NEW' ? 'primary' : 'secondary'} onClick={() => setAssignOpen(true)}>
        {job.status === 'NEW' ? 'มอบหมายช่าง & นัดประเมิน' : 'ปรับทีมช่าง'}
      </Button>
    ),
    (isAdmin || isLead) && job.status === 'CONTRACTED' && (
      <Button key="start" onClick={() => start.mutate([job.jobId])} disabled={start.isPending}>เริ่มงาน</Button>
    ),
    (isAdmin || isLead) && job.status === 'IN_PROGRESS' && (
      <Button key="complete" onClick={() => window.confirm('ยืนยันส่งมอบงาน?') && complete.mutate([job.jobId])} disabled={complete.isPending}>
        ส่งมอบงาน / ปิดงาน
      </Button>
    ),
    isAdmin && job.status === 'SURVEYED' && job.jobType === 'INSPECTION' && (
      <Button key="close-inspection" variant="secondary" onClick={() => complete.mutate([job.jobId, 'ส่งผลตรวจห้องแล้ว ลูกค้าไม่ซ่อม'])}>
        ปิดงานตรวจ (ไม่ซ่อม)
      </Button>
    ),
    ((isAdmin && open) || (user.role === 'USER' && ['NEW', 'SURVEY_ASSIGNED', 'SURVEYED', 'QUOTED'].includes(job.status))) && (
      <Button
        key="cancel"
        variant="ghost"
        onClick={() => {
          const reason = window.prompt('เหตุผลที่ยกเลิกงาน');
          if (reason !== null) cancel.mutate([job.jobId, reason]);
        }}
      >
        ยกเลิกงาน
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

function nextStepHint(job: JobDetail, role: string) {
  const hints: Partial<Record<JobDetail['status'], Record<string, string>>> = {
    NEW: { ADMIN: 'มอบหมายช่างและนัดวันประเมินหน้างาน', USER: 'รอแอดมินนัดช่างเข้าประเมิน' },
    SURVEY_ASSIGNED: { TECHNICIAN: 'เข้าหน้างานตามนัดแล้วบันทึกผลประเมิน', ADMIN: 'รอช่างส่งผลประเมิน', USER: 'ช่างจะเข้าประเมินตามวันนัด' },
    SURVEYED: { ADMIN: 'ร่างสัญญาจากผลประเมินแล้วส่งให้ลูกค้า', USER: 'รอแอดมินส่งสัญญา', TECHNICIAN: 'รอทำสัญญา' },
    QUOTED: { USER: 'ตรวจสอบและลงนามสัญญา', ADMIN: 'รอลูกค้าลงนาม', TECHNICIAN: 'รอลูกค้าลงนาม' },
    CONTRACTED: { TECHNICIAN: 'เบิกวัสดุแล้วกดเริ่มงาน (หัวหน้าช่าง)', ADMIN: 'รอช่างเริ่มงาน', USER: 'ชำระงวดแรกตามสัญญา' },
    IN_PROGRESS: { TECHNICIAN: 'บันทึกงานรายวัน พบงานเพิ่มให้กด "แจ้งงานเพิ่ม"', ADMIN: 'ติดตามความคืบหน้า อนุมัติใบเบิก', USER: 'ติดตามความคืบหน้า' },
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
