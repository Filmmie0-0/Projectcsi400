import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ROLE_HOME } from '../layouts/navigation/menus';

// path "/" ไม่มีหน้าแล้ว: ยังไม่ล็อกอิน → /login, ล็อกอินอยู่ → แดชบอร์ดของ role
export default function RootRedirect() {
  const { user, expiresAt } = useAuthStore();
  const loggedIn = Boolean(user && expiresAt && expiresAt > Date.now());
  return <Navigate to={loggedIn && user ? ROLE_HOME[user.role] : '/login'} replace />;
}
