import { Link } from 'react-router-dom';
import { CalendarClock, Hammer } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import QueryState from '../../components/common/QueryState';
import { useJobs } from '../../hooks/useJobs';
import { UNIT_TYPE } from '../../constants/labels';
import { formatDate } from '../../utils/formatDate';
import type { JobListItem } from '../../types/job';

// หน้าแรกของช่าง: นัดประเมินที่ใกล้ถึง + งานที่กำลังทำ (ออกแบบให้ใช้บนมือถือหน้างาน)
export default function TechDashboardPage() {
  const jobs = useJobs();
  const all = jobs.data ?? [];
  const surveys = all.filter((j) => j.status === 'SURVEY_ASSIGNED').sort((a, b) => (a.surveyDate ?? '').localeCompare(b.surveyDate ?? ''));
  const working = all.filter((j) => ['CONTRACTED', 'IN_PROGRESS'].includes(j.status));

  return (
    <div className="space-y-8">
      <PageHeader title="งานของฉันวันนี้" />
      <QueryState query={jobs}>
        <Section icon={CalendarClock} title="นัดประเมินหน้างาน" jobs={surveys} empty="ไม่มีนัดประเมิน" />
        <Section icon={Hammer} title="งานที่ต้องลงมือทำ" jobs={working} empty="ไม่มีงานที่กำลังทำ" />
      </QueryState>
    </div>
  );
}

function Section({ icon: Icon, title, jobs, empty }: { icon: typeof Hammer; title: string; jobs: JobListItem[]; empty: string }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5 text-walnut-500" /> {title}</h2>
      {!jobs.length && <EmptyState title={empty} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {jobs.map((j) => (
          <Link key={j.jobId} to={`/jobs/${j.jobId}`}>
            <Card className="p-4 transition-shadow hover:shadow-lift">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-espresso-500">{j.jobCode}</span>
                <StatusBadge kind="job" status={j.status} />
              </div>
              <p className="mt-2 font-medium">{j.title}</p>
              <p className="text-sm text-espresso-500">{j.buildingName} · {UNIT_TYPE[j.unitType]} {j.unitCode}</p>
              {j.surveyDate && <p className="mt-2 text-sm font-medium text-walnut-700">นัด {formatDate(j.surveyDate)}</p>}
              {j.progressPct !== null && j.status === 'IN_PROGRESS' && (
                <p className="mt-2 text-sm text-espresso-500">ความคืบหน้า {j.progressPct}%</p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
