import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { authService } from '../../services/authService';
import { toApiError } from '../../services/apiError';
import { useAuthStore } from '../../store/authStore';
import type { Role } from '../../types/user';

const HOME: Record<Role, string> = { ADMIN: '/admin', OWNER: '/owner', TENANT: '/tenant' };

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const result = await authService.login({ email, password });
      login(result.user, result.expiresIn);
      navigate(HOME[result.user.role], { replace: true });
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-espresso-900">เข้าสู่ระบบ</h1>
        <p className="mt-1 text-sm text-espresso-500">กรอกอีเมลและรหัสผ่านเพื่อเข้าสู่ระบบ</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
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
          label="รหัสผ่าน"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </Button>
      </form>
      <p className="text-center text-sm text-espresso-500">
        ยังไม่มีบัญชี? <Link className="font-medium text-walnut-600 hover:underline" to="/register">สมัครสมาชิก</Link>
      </p>
    </div>
  );
}
