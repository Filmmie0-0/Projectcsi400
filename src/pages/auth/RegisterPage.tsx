import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { ErrorText } from '../../components/common/QueryState';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services/authService';

// สมัครเองได้เฉพาะลูกค้า (USER) — ช่างและแอดมินให้แอดมินสร้างในหน้า "ผู้ใช้ & ช่าง"
export default function RegisterPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { user, token } = await authService.register(form);
      login(user, token);
      navigate('/user');
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-espresso-900">สมัครใช้งาน</h1>
        <p className="mt-1 text-sm text-espresso-500">สำหรับเจ้าของตึก/หอพักที่ต้องการแจ้งงานตรวจห้องหรือรีโนเวท</p>
      </div>
      <Input label="ชื่อ-นามสกุล" value={form.fullName} onChange={set('fullName')} required />
      <Input label="อีเมล" type="email" value={form.email} onChange={set('email')} required />
      <Input label="เบอร์โทร" value={form.phone} onChange={set('phone')} />
      <Input label="รหัสผ่าน (อย่างน้อย 8 ตัว)" type="password" minLength={8} value={form.password} onChange={set('password')} required />
      <ErrorText error={error} />
      <Button className="w-full" disabled={loading}>สมัครสมาชิก</Button>
      <p className="text-center text-sm text-espresso-500">
        มีบัญชีแล้ว? <Link to="/login" className="font-medium text-walnut-600 hover:underline">เข้าสู่ระบบ</Link>
      </p>
    </form>
  );
}
