import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { ErrorText } from '../../components/common/QueryState';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services/authService';

// สมัครเองได้เฉพาะลูกค้า (USER) — ช่างและแอดมินให้แอดมินสร้างในหน้า "ผู้ใช้ & ช่าง"
// ที่อยู่ไม่ต้องกรอกที่นี่ เพราะลูกค้าเพิ่มที่อยู่ของแต่ละตึกตอนแจ้งงาน
export default function RegisterPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError({ status: 0, code: 'VALIDATION', message: 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน' });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { confirmPassword, ...body } = form;
      const { user, expiresIn } = await authService.register(body);
      login(user, expiresIn);
      navigate('/user', { replace: true });
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
      <Input label="ชื่อ-นามสกุล" autoComplete="name" maxLength={150} value={form.fullName} onChange={set('fullName')} required />
      <Input label="อีเมล" type="email" autoComplete="email" maxLength={255} value={form.email} onChange={set('email')} required />
      <Input
        label="เบอร์โทรศัพท์"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        pattern="[0-9+() -]{8,20}"
        title="กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง"
        value={form.phone}
        onChange={set('phone')}
        required
      />
      <Input label="รหัสผ่าน (8-72 ตัวอักษร)" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={form.password} onChange={set('password')} required />
      <Input label="ยืนยันรหัสผ่าน" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={form.confirmPassword} onChange={set('confirmPassword')} required />
      <ErrorText error={error} />
      <Button className="w-full" disabled={loading}>{loading ? 'กำลังสมัครสมาชิก...' : 'สมัครสมาชิก'}</Button>
      <p className="text-center text-sm text-espresso-500">
        มีบัญชีแล้ว? <Link to="/login" className="font-medium text-walnut-600 hover:underline">เข้าสู่ระบบ</Link>
      </p>
    </form>
  );
}
