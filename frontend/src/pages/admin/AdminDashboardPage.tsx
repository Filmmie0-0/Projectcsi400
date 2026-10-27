import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, ClipboardList, Hammer, PackageOpen, PlugZap, Search, Users } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import QueryState from '../../components/common/QueryState';
import JobTable from '../../components/features/job/JobTable';
import { useAdminSummary, useJobs } from '../../hooks/useJobs';
import { formatCurrency } from '../../utils/formatCurrency';

export default function AdminDashboardPage() {
  const summary = useAdminSummary();
  const newJobs = useJobs({ status: 'NEW' });
  const s = summary.data;

  return (
    <div className="space-y-8">
      <PageHeader title="ภาพรวมระบบ" description="รวมข้อมูลจาก auth / job / inventory service ผ่าน gateway" />
      <QueryState query={summary}>
        {s && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="งานใหม่รอมอบหมาย" value={s.newJobs ?? 0} icon={ClipboardList} hint={`จากพาร์ทเนอร์ทั้งหมด ${s.partnerJobs ?? 0} งาน`} />
              <StatCard label="อยู่ระหว่างประเมิน/เสนอราคา" value={s.jobsInSurvey ?? 0} icon={Search} />
              <StatCard label="กำลังดำเนินงาน" value={s.jobsInProgress ?? 0} icon={Hammer} hint={`เสร็จแล้ว ${s.jobsCompleted ?? 0} งาน`} />
              <StatCard label="รายรับที่ยืนยันแล้ว" value={formatCurrency(s.totalRevenue)} icon={Banknote} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <AlertLink to="/billing" icon={Banknote} label="สลิปรอตรวจสอบ" value={s.invoicesToVerify} />
              <AlertLink to="/requisitions" icon={PackageOpen} label="ใบเบิกรออนุมัติ" value={s.pendingRequisitions} />
              <AlertLink to="/admin/materials" icon={AlertTriangle} label="วัสดุใกล้หมด" value={s.lowStockMaterials} />
              <AlertLink to="/admin/users" icon={Users} label="ช่างที่ใช้งานอยู่" value={s.totalTechnicians} neutral />
            </div>
          </>
        )}
      </QueryState>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">งานใหม่ที่ต้องมอบหมาย</h2>
          <Link to="/admin/partners" className="inline-flex items-center gap-1 text-sm text-walnut-600 hover:underline">
            <PlugZap className="h-4 w-4" /> พาร์ทเนอร์ API
          </Link>
        </div>
        <QueryState query={newJobs}>
          <JobTable jobs={newJobs.data ?? []} empty="ไม่มีงานใหม่" />
        </QueryState>
      </section>
    </div>
  );
}

function AlertLink({ to, icon: Icon, label, value, neutral }: { to: string; icon: typeof Users; label: string; value: number; neutral?: boolean }) {
  const hot = !neutral && value > 0;
  return (
    <Link to={to} className={`flex items-center gap-3 rounded-card border p-4 transition-colors ${hot ? 'border-warning/40 bg-warning-soft' : 'border-line bg-white hover:bg-cream-100'}`}>
      <Icon className={`h-5 w-5 ${hot ? 'text-warning' : 'text-espresso-300'}`} />
      <span className="flex-1 text-sm">{label}</span>
      <span className="text-lg font-semibold">{value ?? 0}</span>
    </Link>
  );
}
