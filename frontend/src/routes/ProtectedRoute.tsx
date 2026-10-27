import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// ออกจากระบบอัตโนมัติเมื่อ token หมดอายุ (cookie หมดอายุพร้อมกัน)
export default function ProtectedRoute() {
  const { user, expiresAt, logout } = useAuthStore();
  const isAuthenticated = Boolean(user && expiresAt && expiresAt > Date.now());

  useEffect(() => {
    if (!user) return;
    if (!expiresAt || expiresAt <= Date.now()) {
      logout();
      return;
    }
    const timeout = window.setTimeout(logout, expiresAt - Date.now());
    return () => window.clearTimeout(timeout);
  }, [expiresAt, logout, user]);

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
