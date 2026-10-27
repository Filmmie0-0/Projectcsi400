import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { ErrorText } from '../../components/common/QueryState';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services/authService';
import { ROLE_HOME } from '../../layouts/navigation/menus';

// บัญชีเดโมจาก database/services/01_auth_db.sql (รหัสผ่าน password123)
const DEMO = [
  { label: 'แอดมิน', email: 'admin@renocare.local' },
  { label: 'ลูกค้า (เจ้าของหอ)', email: 'owner@renocare.local' },
  { label: 'ลูกค้า (DormBook)', email: 'partner@dormbook.local' },
  { label: 'ช่างเอก', email: 'tech1@renocare.local' },
  { label: 'ช่างบี', email: 'tech2@renocare.local' },
];

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e?: FormEvent, creds = { email, password }) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { user, expiresIn } = await authService.login(creds.email, creds.password);
      login(user, expiresIn);
      navigate(ROLE_HOME[user.role], { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
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
      <div className="border-t border-line pt-4">
        <p className="mb-2 text-xs font-medium text-espresso-500">บัญชีเดโม (รหัสผ่าน password123)</p>
        <div className="flex flex-wrap gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              disabled={loading}
              onClick={() => submit(undefined, { email: d.email, password: 'password123' })}
              className="rounded-full bg-cream-200 px-3 py-1 text-xs text-espresso-700 hover:bg-sand-200"
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-center text-sm text-espresso-500">
        ยังไม่มีบัญชี? <Link to="/register" className="font-medium text-walnut-600 hover:underline">สมัครเป็นลูกค้า</Link>
      </p>
    </div>
  );
}
