import { Link } from 'react-router-dom';
import { PlugZap } from 'lucide-react';
import Table, { Td, Th } from '../../ui/Table';
import Badge from '../../ui/Badge';
import EmptyState from '../../ui/EmptyState';
import StatusBadge from '../../common/StatusBadge';
import { JOB_TYPE, PRIORITY, UNIT_TYPE } from '../../../constants/labels';
import { formatDate } from '../../../utils/formatDate';
import type { JobListItem } from '../../../types/job';

export default function JobTable({ jobs, empty = 'ยังไม่มีงาน' }: { jobs: JobListItem[]; empty?: string }) {
  if (!jobs.length) return <EmptyState title={empty} />;
  return (
    <Table>
      <thead>
        <tr>
          <Th>งาน</Th>
          <Th>สถานที่</Th>
          <Th>ช่าง</Th>
          <Th>นัด/ต้องการ</Th>
          <Th>สถานะ</Th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.jobId} className="hover:bg-cream-50">
            <Td>
              <Link to={`/jobs/${j.jobId}`} className="font-medium text-walnut-700 hover:underline">{j.title}</Link>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-espresso-500">
                <span className="font-mono">{j.jobCode}</span>
                <span>· {JOB_TYPE[j.jobType]}</span>
                {j.priority === 'URGENT' && <Badge tone={PRIORITY.URGENT.tone}>{PRIORITY.URGENT.label}</Badge>}
                {j.source === 'PARTNER' && (
                  <Badge tone="info"><PlugZap className="mr-1 h-3 w-3" />{j.partnerName}</Badge>
                )}
              </div>
            </Td>
            <Td>
              {j.buildingName}
              <div className="text-xs text-espresso-500">{UNIT_TYPE[j.unitType]} {j.unitCode}</div>
            </Td>
            <Td className="text-sm">{j.leadTechnician ?? <span className="text-espresso-300">ยังไม่มอบหมาย</span>}</Td>
            <Td className="whitespace-nowrap text-sm">{formatDate(j.surveyDate ?? j.preferredDate)}</Td>
            <Td>
              <StatusBadge kind="job" status={j.status} />
              {j.status === 'IN_PROGRESS' && j.progressPct !== null && (
                <div className="mt-1.5 h-1.5 w-20 rounded-full bg-cream-200">
                  <div className="h-1.5 rounded-full bg-walnut-400" style={{ width: `${j.progressPct}%` }} />
                </div>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
