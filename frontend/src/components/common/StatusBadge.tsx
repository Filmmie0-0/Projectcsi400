import type { BookingStatus } from '../../types/booking';

const STYLE: Record<BookingStatus, { label: string; cls: string }> = {
  PENDING: { label: 'รอตรวจสอบ', cls: 'bg-warning-soft text-warning' },
  APPROVED: { label: 'อนุมัติแล้ว', cls: 'bg-success-soft text-success' },
  REJECTED: { label: 'ไม่อนุมัติ', cls: 'bg-danger-soft text-danger' },
  CANCELLED: { label: 'ยกเลิก', cls: 'bg-cream-200 text-espresso-500' },
  EXPIRED: { label: 'หมดอายุ', cls: 'bg-cream-200 text-espresso-500' },
  COMPLETED: { label: 'เสร็จสิ้น', cls: 'bg-info-soft text-info' },
};

export default function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, cls } = STYLE[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
