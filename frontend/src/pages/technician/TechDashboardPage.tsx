import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Hammer, Hourglass, MapPin, PackageOpen, PlayCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/common/StatusBadge';
import QueryState from '../../components/common/QueryState';
import { useJobs } from '../../hooks/useJobs';
import { useRequisitions } from '../../hooks/useInventory';
import { useAuthStore } from '../../store/authStore';
import { UNIT_TYPE } from '../../constants/labels';
import { formatDate } from '../../utils/formatDate';
import type { JobListItem } from '../../types/job';

// จำนวนวันจากวันนี้ถึงวันนัด (ตามเวลาเครื่อง): 0 = วันนี้, 1 = พรุ่งนี้, ติดลบ = เลยนัดแล้ว
function daysFromToday(date: string | null) {
  if (!date) return null;
  const d = new Date(date);
  const today = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86_400_000);
}

const todayLabel = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// หน้าแรกของช่าง: สรุปตัวเลข + สิ่งที่ต้องทำวันนี้ (ใช้บนมือถือหน้างานได้)
export default function TechDashboardPage() {
  const user = useAuthStore((s) => s.user!);
  const jobs = useJobs();
  const reqs = useRequisitions();
  const all = jobs.data ?? [];

  const surveys = all
    .filter((j) => j.status === 'SURVEY_ASSIGNED')
    .sort((a, b) => (a.surveyDate ?? '9').localeCompare(b.surveyDate ?? '9'));
  const surveysToday = surveys.filter((j) => (daysFromToday(j.surveyDate) ?? 1) <= 0);
  const inProgress = all.filter((j) => j.status === 'IN_PROGRESS');
  const readyToStart = all.filter((j) => j.status === 'CONTRACTED');
  const waiting = all.filter((j) => ['SURVEYED', 'QUOTED'].includes(j.status));
  const done = all.filter((j) => j.status === 'COMPLETED');
  const myReqs = reqs.data ?? [];
  const reqPending = myReqs.filter((r) => r.status === 'PENDING').length;
  const reqRejected = myReqs.filter((r) => r.status === 'REJECTED').length;
  const avgProgress = inProgress.length
    ? Math.round(inProgress.reduce((s, j) => s + (j.progressPct ?? 0), 0) / inProgress.length)
    : null;

  return (
    <div className="space-y-8">
      <PageHeader title="งานของฉันวันนี้" description={`${user.fullName} · ${todayLabel}`} />
      <QueryState query={jobs}>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="นัดประเมินวันนี้" value={surveysToday.length} icon={CalendarClock} hint={`นัดทั้งหมด ${surveys.length} งาน`} />
          <StatCard
            label="กำลังดำเนินงาน"
            value={inProgress.length}
            icon={Hammer}
            hint={avgProgress !== null ? `ความคืบหน้าเฉลี่ย ${avgProgress}%` : 'ยังไม่มีงานที่กำลังทำ'}
          />
          <StatCard label="รอลูกค้า / รอเริ่มงาน" value={waiting.length + readyToStart.length} icon={Hourglass} hint={`พร้อมเริ่ม ${readyToStart.length} งาน`} />
          <StatCard label="งานที่เสร็จแล้ว" value={done.length} icon={CheckCircle2} />
        </div>

        {/* แถบเตือน: สิ่งที่ต้องจัดการก่อน */}
        {(readyToStart.length > 0 || reqPending > 0 || reqRejected > 0) && (
          <div className="grid gap-3 sm:grid-cols-3">
            {readyToStart.length > 0 && (
              <AlertLink to={`/jobs/${readyToStart[0].jobId}`} icon={PlayCircle} label="งานพร้อมเริ่ม (ลูกค้าเซ็นแล้ว)" value={readyToStart.length} />
            )}
            {reqPending > 0 && <AlertLink to="/requisitions" icon={PackageOpen} label="ใบเบิกรออนุมัติ" value={reqPending} />}
            {reqRejected > 0 && <AlertLink to="/requisitions" icon={AlertTriangle} label="ใบเบิกถูกปฏิเสธ" value={reqRejected} danger />}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <section className="space-y-3">
            <SectionTitle icon={Hammer} title="งานที่ต้องลงมือทำ" count={inProgress.length + readyToStart.length} />
            {!inProgress.length && !readyToStart.length && <Empty text="ไม่มีงานที่กำลังทำ" />}
            {[...readyToStart, ...inProgress].map((j) => <WorkCard key={j.jobId} job={j} />)}
          </section>

          <section className="space-y-3">
            <SectionTitle icon={CalendarClock} title="นัดประเมินหน้างาน" count={surveys.length} />
            {!surveys.length && <Empty text="ไม่มีนัดประเมิน" />}
            {!!surveys.length && (
              <Card className="divide-y divide-line p-0">
                {surveys.map((j) => <SurveyRow key={j.jobId} job={j} />)}
              </Card>
            )}
          </section>
        </div>

        {waiting.length > 0 && (
          <section className="space-y-3">
            <SectionTitle icon={Hourglass} title="รอขั้นตอนถัดไป" count={waiting.length} />
            <Card className="divide-y divide-line p-0">
              {waiting.map((j) => (
                <Link key={j.jobId} to={`/jobs/${j.jobId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-100">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{j.title}</p>
                    <p className="truncate text-xs text-espresso-500">{j.jobCode} · {j.buildingName}</p>
                  </div>
                  <StatusBadge kind="job" status={j.status} />
                  <ChevronRight className="h-4 w-4 text-espresso-300" />
                </Link>
              ))}
            </Card>
          </section>
        )}
      </QueryState>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, count }: { icon: LucideIcon; title: string; count: number }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <Icon className="h-5 w-5 text-walnut-500" /> {title}
      <span className="rounded-full bg-sand-200 px-2 py-0.5 text-xs font-medium text-espresso-700">{count}</span>
    </h2>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-espresso-500">{text}</p>;
}

function AlertLink({ to, icon: Icon, label, value, danger }: { to: string; icon: LucideIcon; label: string; value: number; danger?: boolean }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-card border p-4 transition-opacity hover:opacity-90 ${danger ? 'border-danger/30 bg-danger-soft' : 'border-warning/40 bg-warning-soft'}`}
    >
      <Icon className={`h-5 w-5 ${danger ? 'text-danger' : 'text-warning'}`} />
      <span className="flex-1 text-sm">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </Link>
  );
}

function WorkCard({ job: j }: { job: JobListItem }) {
  const pct = Math.min(100, Math.max(0, j.progressPct ?? 0));
  const ready = j.status === 'CONTRACTED';
  return (
    <Link to={`/jobs/${j.jobId}`} className="block">
      <Card className="p-4 transition-shadow hover:shadow-lift">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-espresso-500">{j.jobCode}</span>
          <StatusBadge kind="job" status={j.status} />
        </div>
        <p className="mt-2 font-medium">{j.title}</p>
        <p className="flex items-center gap-1 text-sm text-espresso-500">
          <MapPin className="h-3.5 w-3.5" /> {j.buildingName} · {UNIT_TYPE[j.unitType]} {j.unitCode}
        </p>
        {ready ? (
          <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-walnut-700">
            <PlayCircle className="h-4 w-4" /> ลูกค้าเซ็นแล้ว — เบิกวัสดุแล้วกดเริ่มงาน
          </p>
        ) : (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-espresso-500">
              <span>ความคืบหน้า</span>
              <span className="font-medium text-espresso-900">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sand-200">
              <div className="h-full rounded-full bg-walnut-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </Card>
    </Link>
  );
}

function SurveyRow({ job: j }: { job: JobListItem }) {
  const d = daysFromToday(j.surveyDate);
  const when =
    d === null ? { text: 'ยังไม่ระบุวัน', cls: 'bg-sand-200 text-espresso-700' }
    : d < 0 ? { text: `เลยนัด ${-d} วัน`, cls: 'bg-danger-soft text-danger' }
    : d === 0 ? { text: 'วันนี้', cls: 'bg-walnut-500 text-cream-50' }
    : d === 1 ? { text: 'พรุ่งนี้', cls: 'bg-warning-soft text-warning' }
    : { text: formatDate(j.surveyDate), cls: 'bg-sand-200 text-espresso-700' };
  return (
    <Link to={`/jobs/${j.jobId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-100">
      <span className={`w-20 shrink-0 rounded-md px-2 py-1 text-center text-xs font-medium ${when.cls}`}>{when.text}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{j.title}</p>
        <p className="truncate text-xs text-espresso-500">{j.buildingName} · {UNIT_TYPE[j.unitType]} {j.unitCode}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-espresso-300" />
    </Link>
  );
}
