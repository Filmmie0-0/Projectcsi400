import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';
import type { Role } from '../../types/user';

const HOME: Record<Role, string> = { ADMIN: '/admin', OWNER: '/owner', TENANT: '/tenant' };

// DEMO ONLY: เลือก role เพื่อทดสอบ layout — ให้แทนที่ด้วย API จริง (authService)
export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const demo = (role: Role, fullName: string) => {
    login({ userId: 1, email: `${role.toLowerCase()}@demo.com`, fullName, role }, 'demo-token');
    navigate(HOME[role]);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-espresso-900">เข้าสู่ระบบ</h1>
        <p className="mt-1 text-sm text-espresso-500">โหมดทดลอง: เลือกบทบาทเพื่อดูหน้าจอ</p>
      </div>
      <Button className="w-full" onClick={() => demo('TENANT', 'สมชาย ผู้เช่า')}>เข้าในฐานะผู้เช่า</Button>
      <Button className="w-full" variant="secondary" onClick={() => demo('OWNER', 'สมหญิง เจ้าของพื้นที่')}>เข้าในฐานะเจ้าของพื้นที่</Button>
      <Button className="w-full" variant="ghost" onClick={() => demo('ADMIN', 'แอดมิน')}>เข้าในฐานะผู้ดูแลระบบ</Button>
    </div>
  );
}
