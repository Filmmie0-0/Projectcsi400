import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { authService } from '../../services/authService';
import { toApiError } from '../../services/apiError';
import { useAuthStore } from '../../store/authStore';
import type { Role } from '../../types/user';

const HOME: Record<Exclude<Role, 'ADMIN'>, string> = {
  OWNER: '/owner',
  TENANT: '/tenant',
};

export default function RegisterPage() {
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'ADMIN'>>('TENANT');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await authService.register({
        fullName,
        email,
        phone,
        address,
        businessName: role === 'OWNER' ? businessName : '',
        taxId: role === 'OWNER' ? taxId : '',
        password,
        role,
      });
      login(result.user, result.expiresIn);
      navigate(result.user.role === 'OWNER' ? HOME.OWNER : HOME.TENANT, { replace: true });
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-espresso-900">สมัครสมาชิก</h1>
        <p className="mt-1 text-sm text-espresso-500">สร้างบัญชีเพื่อเริ่มใช้งาน MicroFulfill</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Input
          label="ชื่อ-นามสกุล"
          type="text"
          autoComplete="name"
          required
          maxLength={150}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
        <Input
          label="อีเมล"
          type="email"
          autoComplete="email"
          required
          maxLength={255}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="เบอร์โทรศัพท์"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          required
          maxLength={20}
          pattern="[0-9+() -]{8,20}"
          title="กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-espresso-700">ที่อยู่</span>
          <textarea
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-espresso-900 placeholder:text-espresso-500 focus:border-walnut-400"
            autoComplete="street-address"
            required
            maxLength={2000}
            rows={3}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>
        {role === 'OWNER' && (
          <>
            <Input
              label="ชื่อธุรกิจ / ชื่อหอพัก"
              type="text"
              autoComplete="organization"
              required
              maxLength={200}
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
            <Input
              label="เลขประจำตัวผู้เสียภาษี (ถ้ามี)"
              type="text"
              inputMode="numeric"
              maxLength={20}
              value={taxId}
              onChange={(event) => setTaxId(event.target.value)}
            />
          </>
        )}
        <Input
          label="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Input
          label="ยืนยันรหัสผ่าน"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-espresso-700">ประเภทบัญชี</span>
          <select
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-espresso-900 focus:border-walnut-400"
            value={role}
            onChange={(event) => setRole(event.target.value as Exclude<Role, 'ADMIN'>)}
          >
            <option value="TENANT">ผู้เช่า</option>
            <option value="OWNER">เจ้าของพื้นที่</option>
          </select>
        </label>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'กำลังสมัครสมาชิก...' : 'สมัครสมาชิก'}
        </Button>
      </form>
      <p className="text-center text-sm text-espresso-500">
        มีบัญชีอยู่แล้ว? <Link className="font-medium text-walnut-600 hover:underline" to="/login">เข้าสู่ระบบ</Link>
      </p>
    </div>
  );
}
