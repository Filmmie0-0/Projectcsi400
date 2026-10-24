export type Role = 'ADMIN' | 'OWNER' | 'TENANT';

export interface User {
  userId: number;
  email: string;
  fullName: string;
  role: Role;
}
