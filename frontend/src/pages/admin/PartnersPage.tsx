import { useEffect, useRef } from 'react';
import { BellRing, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import QueryState from '../../components/common/QueryState';
import JobTable from '../../components/features/job/JobTable';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { usePartnerInboxJobs } from '../../hooks/useJobs';
import { API_URL } from '../../services/apiClient';
import { toast } from '../../store/toastStore';

export default function PartnersPage() {
  const jobs = usePartnerInboxJobs();
  const seenJobIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!jobs.data) return;

    const currentJobIds = new Set(jobs.data.map((job) => job.jobId));
    if (seenJobIds.current) {
      const newJobs = jobs.data.filter((job) => !seenJobIds.current?.has(job.jobId));
      if (newJobs.length === 1) {
        toast.info(`ได้รับงานใหม่จาก ${newJobs[0].partnerName ?? 'พาร์ทเนอร์'}: ${newJobs[0].jobCode}`);
      } else if (newJobs.length > 1) {
        toast.info(`ได้รับงานใหม่จากพาร์ทเนอร์ ${newJobs.length} รายการ`);
      }
    }
    seenJobIds.current = currentJobIds;
  }, [jobs.data]);

  return (
    <>
      <PageHeader
        title="งานจากเว็บพาร์ทเนอร์"
        description="ระบบจะตรวจงานใหม่จากเว็บเพื่อนอัตโนมัติทุก 5 วินาที"
        action={
          <Button variant="secondary" onClick={() => jobs.refetch()} disabled={jobs.isFetching}>
            <RefreshCw className={`h-4 w-4 ${jobs.isFetching ? 'animate-spin' : ''}`} />
            รีเฟรช
          </Button>
        }
      />

      <QueryState query={jobs}>
        <div className="space-y-5">
          <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-info-soft p-3 text-info">
                <BellRing className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">กำลังรอรับงาน</h2>
                  <Badge tone="success">พร้อมรับงาน</Badge>
                </div>
                <p className="mt-1 text-sm text-espresso-500">
                  ให้เว็บพาร์ทเนอร์ส่งงานด้วย POST และ API key ที่ออกให้พาร์ทเนอร์
                </p>
                <code className="mt-2 block break-all rounded bg-cream-100 px-3 py-2 text-xs">
                  {API_URL}/partner/v1/jobs
                </code>
              </div>
            </div>
            <div className="shrink-0 text-sm text-espresso-500">
              งานล่าสุดที่แสดง <span className="font-semibold text-espresso-900">{jobs.data?.length ?? 0}</span> รายการ
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="font-semibold">รายการงานที่เข้ามา</h2>
              <p className="mt-1 text-sm text-espresso-500">
                เมื่อมีงานใหม่ หน้านี้จะแจ้งเตือนและเพิ่มงานไว้ด้านบน
              </p>
            </div>
            <JobTable
              jobs={jobs.data ?? []}
              empty="ยังไม่มีงานจากเว็บพาร์ทเนอร์"
            />
          </Card>
        </div>
      </QueryState>
    </>
  );
}
