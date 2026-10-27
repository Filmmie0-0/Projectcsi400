import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import QueryState from '../../components/common/QueryState';
import JobTable from '../../components/features/job/JobTable';
import { useInvoices, useJobs } from '../../hooks/useJobs';
import { formatCurrency } from '../../utils/formatCurrency';

export default function UserDashboardPage() {
  const jobs = useJobs();
  const invoices = useInvoices();
  const all = jobs.data ?? [];
  const toSign = all.filter((j) => j.status === 'QUOTED').length;
  const active = all.filter((j) => !['COMPLETED', 'CANCELLED'].includes(j.status));
  const unpaid = (invoices.data ?? []).filter((v) => v.status === 'UNPAID');

  return (
    <div className="space-y-8">
      <PageHeader
        title="ภาพรวมงานของฉัน"
        action={
          <Link to="/user/jobs/new" className="inline-flex items-center gap-2 rounded-lg bg-walnut-500 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-walnut-600">
            <Plus className="h-4 w-4" /> แจ้งงานใหม่
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="งานที่กำลังดำเนินการ" value={active.length} />
        <StatCard label="สัญญารอลงนาม" value={toSign} hint={toSign ? 'เปิดงานเพื่อตรวจสอบและลงนาม' : undefined} />
        <StatCard label="ยอดค้างชำระ" value={formatCurrency(unpaid.reduce((s, v) => s + v.amount, 0))} hint={`${unpaid.length} งวด`} />
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">งานที่ยังไม่ปิด</h2>
        <QueryState query={jobs}>
          <JobTable jobs={active} empty="ยังไม่มีงานที่เปิดอยู่" />
        </QueryState>
      </section>
    </div>
  );
}
