import { useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import QueryState from '../../components/common/QueryState';
import Tabs from '../../components/ui/Tabs';
import EmptyState from '../../components/ui/EmptyState';
import RequisitionCard from '../../components/features/inventory/RequisitionCard';
import { useRequisitions } from '../../hooks/useInventory';
import { useAuthStore } from '../../store/authStore';
import type { RequisitionStatus } from '../../types/inventory';

// ADMIN: อนุมัติ/จ่ายของทุกใบ | TECHNICIAN: ใบเบิกของตัวเอง (สร้างใบเบิกจากหน้ารายละเอียดงาน)
export default function RequisitionsPage() {
  const user = useAuthStore((s) => s.user!);
  const [status, setStatus] = useState<RequisitionStatus | 'ALL'>(user.role === 'ADMIN' ? 'PENDING' : 'ALL');
  const reqs = useRequisitions();
  const all = reqs.data ?? [];
  const list = status === 'ALL' ? all : all.filter((r) => r.status === status);
  const count = (s: RequisitionStatus) => all.filter((r) => r.status === s).length;

  return (
    <>
      <PageHeader
        title="ใบเบิกวัสดุ"
        description={user.role === 'ADMIN' ? 'อนุมัติแล้วระบบตัดสต็อกทันที ช่างคืนของเหลือได้ตอนปิดใบเบิก' : 'สร้างใบเบิกใหม่ได้จากหน้ารายละเอียดงาน'}
      />
      <Tabs
        value={status}
        onChange={setStatus}
        tabs={[
          { value: 'PENDING', label: 'รออนุมัติ', count: count('PENDING') },
          { value: 'ISSUED', label: 'จ่ายของแล้ว', count: count('ISSUED') },
          { value: 'CLOSED', label: 'ปิดแล้ว' },
          { value: 'REJECTED', label: 'ไม่อนุมัติ' },
          { value: 'ALL', label: 'ทั้งหมด' },
        ]}
      />
      <div className="mt-4 space-y-3">
        <QueryState query={reqs}>
          {!list.length && <EmptyState title="ไม่มีใบเบิก" />}
          {list.map((r) => <RequisitionCard key={r.requisitionId} req={r} role={user.role} userId={user.userId} />)}
        </QueryState>
      </div>
    </>
  );
}
