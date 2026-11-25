// ADMIN = ผู้ดูแล/รับงาน, USER = บัญชีพาร์ทเนอร์ (1 บัญชีต่อ 1 พาร์ทเนอร์ ใช้เซ็นสัญญา/ชำระเงินของงานที่พาร์ทเนอร์ส่งมา), TECHNICIAN = ช่าง
export type Role = 'ADMIN' | 'USER' | 'TECHNICIAN';

export interface User {
  userId: number;
  email: string;
  fullName: string;
  role: Role;
  status?: 'ACTIVE' | 'SUSPENDED';
  phone?: string | null;
  skills?: string | null;
  dailyWage?: number | null;
  createdAt?: string;
}

// token อยู่ใน HttpOnly cookie ไม่ได้ส่งมาใน body
export interface AuthResponse {
  user: User;
  expiresIn: number;
}

export interface UserInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: Role;
  skills?: string;
  dailyWage?: number;
}
