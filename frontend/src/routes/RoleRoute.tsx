import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import type { Role } from '../types/user';
import { ROLE_HOME } from '../layouts/navigation/menus';

export default function RoleRoute({ allow }: { allow: Role[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return allow.includes(user.role) ? <Outlet /> : <Navigate to={ROLE_HOME[user.role]} replace />;
}
