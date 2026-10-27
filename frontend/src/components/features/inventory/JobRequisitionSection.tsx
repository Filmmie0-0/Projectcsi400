import { useState } from 'react';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import QueryState from '../../common/QueryState';
import RequisitionCard from './RequisitionCard';
import RequisitionFormModal from './RequisitionFormModal';
import { useJobMaterialCost, useRequisitions } from '../../../hooks/useInventory';
import { formatCurrency } from '../../../utils/formatCurrency';
import type { JobDetail } from '../../../types/job';
import type { Role } from '../../../types/user';

// ข้อมูลจาก inventory-service แสดงในหน้างาน (frontend รวมเอง ไม่ต้อง join ข้าม database)
export default function JobRequisitionSection({ job, role, userId }: { job: JobDetail; role: Role; userId: number }) {
  const [open, setOpen] = useState(false);
  const reqs = useRequisitions({ jobId: job.jobId });
  const cost = useJobMaterialCost(job.jobId, role === 'ADMIN');
  const canRequest = role === 'TECHNICIAN' && ['CONTRACTED', 'IN_PROGRESS'].includes(job.status);
  const contractMaterial = job.contracts.filter((c) => c.status === 'SIGNED').reduce((s, c) => s + c.materialAmount, 0);

  if (!canRequest && !reqs.data?.length) return null;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">วัสดุที่เบิกใช้</h2>
        {canRequest && <Button onClick={() => setOpen(true)}>เบิกวัสดุ</Button>}
      </div>
      {role === 'ADMIN' && cost.data && (
        <p className="rounded-lg bg-cream-100 p-3 text-sm">
          ต้นทุนวัสดุจริง {formatCurrency(cost.data.materialCost)} / ค่าวัสดุตามสัญญา {formatCurrency(contractMaterial)}
          {contractMaterial > 0 && (
            <span className={cost.data.materialCost > contractMaterial ? 'text-danger' : 'text-success'}>
              {' '}({cost.data.materialCost > contractMaterial ? 'เกินงบ' : 'อยู่ในงบ'})
            </span>
          )}
        </p>
      )}
      <QueryState query={reqs}>
        <div className="space-y-3">
          {reqs.data?.map((r) => <RequisitionCard key={r.requisitionId} req={r} role={role} userId={userId} />)}
        </div>
      </QueryState>
      {open && <RequisitionFormModal jobId={job.jobId} open onClose={() => setOpen(false)} />}
    </Card>
  );
}
