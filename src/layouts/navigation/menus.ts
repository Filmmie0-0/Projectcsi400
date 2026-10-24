import {
  LayoutDashboard, Users, Warehouse, CalendarCheck, Package,
  ArrowLeftRight, CreditCard, UserCircle, Search, type LucideIcon,
} from 'lucide-react';
import type { Role } from '../../types/user';

export interface MenuItem { label: string; to: string; icon: LucideIcon }

export const MENUS: Record<Role, MenuItem[]> = {
  ADMIN: [
    { label: 'ภาพรวม', to: '/admin', icon: LayoutDashboard },
    { label: 'จัดการผู้ใช้', to: '/admin/users', icon: Users },
    { label: 'อนุมัติพื้นที่', to: '/admin/spaces', icon: Warehouse },
    { label: 'การจองทั้งหมด', to: '/admin/bookings', icon: CalendarCheck },
    { label: 'ตรวจสอบสลิป', to: '/admin/payments', icon: CreditCard },
  ],
  OWNER: [
    { label: 'ภาพรวม', to: '/owner', icon: LayoutDashboard },
    { label: 'พื้นที่ของฉัน', to: '/owner/spaces', icon: Warehouse },
    { label: 'คำขอจอง', to: '/owner/bookings', icon: CalendarCheck },
  ],
  TENANT: [
    { label: 'ภาพรวม', to: '/tenant', icon: LayoutDashboard },
    { label: 'ค้นหาพื้นที่', to: '/spaces', icon: Search },
    { label: 'การจองของฉัน', to: '/tenant/bookings', icon: CalendarCheck },
    { label: 'สินค้า', to: '/tenant/inventory/products', icon: Package },
    { label: 'รับเข้า / เบิกออก', to: '/tenant/inventory/movements', icon: ArrowLeftRight },
    { label: 'โปรไฟล์', to: '/tenant/profile', icon: UserCircle },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  OWNER: 'เจ้าของพื้นที่',
  TENANT: 'ผู้เช่า',
};
