import {
  LayoutDashboard, Users, ClipboardList, FileSignature, PackageOpen, Boxes, PlugZap, PlusCircle, HardHat, type LucideIcon,
} from 'lucide-react';
import type { Role } from '../../types/user';

export interface MenuItem { label: string; to: string; icon: LucideIcon }

export const MENUS: Record<Role, MenuItem[]> = {
  ADMIN: [
    { label: 'ภาพรวม', to: '/admin', icon: LayoutDashboard },
    { label: 'งานทั้งหมด', to: '/jobs', icon: ClipboardList },
    { label: 'สัญญา & การเงิน', to: '/billing', icon: FileSignature },
    { label: 'ใบเบิกวัสดุ', to: '/requisitions', icon: PackageOpen },
    { label: 'คลังวัสดุ', to: '/admin/materials', icon: Boxes },
    { label: 'ผู้ใช้ & ช่าง', to: '/admin/users', icon: Users },
    { label: 'พาร์ทเนอร์ API', to: '/admin/partners', icon: PlugZap },
  ],
  USER: [
    { label: 'ภาพรวม', to: '/user', icon: LayoutDashboard },
    { label: 'แจ้งงานใหม่', to: '/user/jobs/new', icon: PlusCircle },
    { label: 'งานของฉัน', to: '/jobs', icon: ClipboardList },
    { label: 'สัญญา & การชำระเงิน', to: '/billing', icon: FileSignature },
  ],
  TECHNICIAN: [
    { label: 'งานวันนี้', to: '/tech', icon: HardHat },
    { label: 'งานที่ได้รับมอบหมาย', to: '/jobs', icon: ClipboardList },
    { label: 'ใบเบิกวัสดุ', to: '/requisitions', icon: PackageOpen },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  USER: 'ลูกค้า',
  TECHNICIAN: 'ช่าง',
};

export const ROLE_HOME: Record<Role, string> = { ADMIN: '/admin', USER: '/user', TECHNICIAN: '/tech' };
