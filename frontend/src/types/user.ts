// ADMIN = ผู้ดูแล/รับงาน, USER = ลูกค้า (เจ้าของตึก หรือบัญชีตัวแทนระบบพาร์ทเนอร์), TECHNICIAN = ช่าง
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

export interface AuthResponse {
  token: string;
  user: User;
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
