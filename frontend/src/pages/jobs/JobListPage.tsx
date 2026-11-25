import { useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import QueryState from '../../components/common/QueryState';
import Select from '../../components/ui/Select';
import JobTable from '../../components/features/job/JobTable';
import { useJobs } from '../../hooks/useJobs';
import { useAuthStore } from '../../store/authStore';
import { JOB_STATUS, JOB_TYPE, toOptions } from '../../constants/labels';

const TITLE = { ADMIN: 'งานทั้งหมด', USER: 'งานของฉัน', TECHNICIAN: 'งานที่ได้รับมอบหมาย' } as const;

// หน้าเดียวใช้ทุก role: backend กรองให้ตาม role อยู่แล้ว (USER = งานที่พาร์ทเนอร์ส่งมาในชื่อบัญชีนี้, TECHNICIAN = งานที่ถูกมอบหมาย)
export default function JobListPage() {
  const role = useAuthStore((s) => s.user!.role);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const jobs = useJobs({ status: status || undefined, type: type || undefined });

  return (
    <>
      <PageHeader
        title={TITLE[role]}
        description="งานทั้งหมดรับมาจากระบบพาร์ทเนอร์ผ่าน API"
      />
      <div className="mb-4 grid max-w-md grid-cols-2 gap-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} options={toOptions(JOB_STATUS)} placeholder="ทุกสถานะ" />
        <Select value={type} onChange={(e) => setType(e.target.value)} options={toOptions(JOB_TYPE)} placeholder="ทุกประเภท" />
      </div>
      <QueryState query={jobs}>
        <JobTable jobs={jobs.data ?? []} empty="ไม่พบงานตามเงื่อนไข" />
      </QueryState>
    </>
  );
}
