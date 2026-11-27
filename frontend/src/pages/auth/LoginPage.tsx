import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { ErrorText } from '../../components/common/QueryState';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services/authService';
import { ROLE_HOME } from '../../layouts/navigation/menus';

// บัญชีทดสอบอยู่ใน README.md — ปุ่มด้านล่างกดแล้วล็อกอินทันที
const DEMO_PASSWORD = 'password123';
const DEMO_GROUPS: { title: string; accounts: { label: string; email: string }[] }[] = [
  {
    title: 'แอดมิน',
    accounts: [{ label: 'แอดมิน', email: 'admin@renocare.local' }],
  },
  {
    title: 'ช่าง',
    accounts: [
      { label: 'ช่างเอก (โครงสร้าง)', email: 'tech1@renocare.local' },
      { label: 'ช่างบี (ไฟฟ้า-ประปา)', email: 'tech2@renocare.local' },
      { label: 'ช่างชัย (งานไม้)', email: 'tech3@renocare.local' },
      { label: 'ช่างดำ (ทาสี-ฝ้า)', email: 'tech4@renocare.local' },
      { label: 'ช่างต้น (หลังคา)', email: 'tech5@renocare.local' },
      { label: 'ช่างนนท์ (แอร์)', email: 'tech6@renocare.local' },
      { label: 'ช่างปอ (ประปา)', email: 'tech7@renocare.local' },
    ],
  },
];

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const doLogin = async (mail: string, pass: string) => {
    setLoading(true);
    setError(null);
    try {
      const { user, expiresIn } = await authService.login(mail, pass);
      login(user, expiresIn);
      navigate(ROLE_HOME[user.role], { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    doLogin(email, password);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-espresso-900">เข้าสู่ระบบ RenoCare</h1>
        <p className="mt-1 text-sm text-espresso-500">ระบบรับงานตรวจห้องเช่าและรีโนเวทพื้นที่</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Input label="อีเมล" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="รหัสผ่าน" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <ErrorText error={error} />
        <Button className="w-full" disabled={loading}>{loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</Button>
      </form>
      <div className="space-y-3 border-t border-line pt-4">
        <p className="text-sm font-medium text-espresso-700">เข้าสู่ระบบด่วน (บัญชีทดสอบ)</p>
        {DEMO_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 text-xs text-espresso-500">{group.title}</p>
            <div className="grid grid-cols-2 gap-2">
              {group.accounts.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  onClick={() => doLogin(acc.email, DEMO_PASSWORD)}
                  className="rounded-lg border border-line bg-cream-50 px-3 py-2 text-left text-sm hover:border-walnut-500 hover:bg-cream-100 disabled:opacity-50"
                >
                  <span className="block font-medium text-espresso-900">{acc.label}</span>
                  <span className="block truncate text-xs text-espresso-500">{acc.email}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="border-t border-line pt-4 text-center text-sm text-espresso-500">
        ยังไม่มีบัญชี? <Link to="/register" className="font-medium text-walnut-600 hover:underline">สมัครเป็นลูกค้า</Link>
      </p>
    </div>
  );
}
