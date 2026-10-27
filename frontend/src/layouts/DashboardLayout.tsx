import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Hammer, Menu, X, LogOut } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/authService';
import { toApiError } from '../services/apiError';
import { MENUS, ROLE_LABEL } from './navigation/menus';

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState('');

  if (!user) return null;
  const menu = MENUS[user.role];

  const handleLogout = async () => {
    setLogoutError('');
    try {
      await authService.logout();
      logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setLogoutError(toApiError(err).message);
    }
  };

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-line px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-walnut-500">
          <Hammer className="h-5 w-5 text-cream-50" />
        </div>
        <span className="text-lg font-semibold tracking-tight text-espresso-900">RenoCare</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {menu.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-walnut-500 text-cream-50 shadow-soft'
                  : 'text-espresso-700 hover:bg-cream-200 hover:text-espresso-900',
              ].join(' ')
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sand-200 text-sm font-semibold text-walnut-700">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-espresso-900">{user.fullName}</p>
            <p className="text-xs text-espresso-500">{ROLE_LABEL[user.role]}</p>
          </div>
          <button
            onClick={handleLogout}
            title="ออกจากระบบ"
            className="rounded-md p-2 text-espresso-500 hover:bg-cream-200 hover:text-danger"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream-50 font-sans text-espresso-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-cream-100 lg:block">
        {SidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-espresso-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-cream-100 shadow-lift">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-espresso-500 hover:bg-cream-200"
            >
              <X className="h-5 w-5" />
            </button>
            {SidebarContent}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-cream-50/90 px-4 backdrop-blur sm:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-espresso-700 hover:bg-cream-200 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden text-sm text-espresso-500 lg:block">
            สวัสดี, <span className="font-medium text-espresso-900">{user.fullName}</span>
          </div>

          <div className="flex items-center gap-2">
<<<<<<< HEAD:src/layouts/DashboardLayout.tsx
            <span className="rounded-full bg-walnut-50 px-3 py-1 text-xs font-medium text-walnut-700">{ROLE_LABEL[user.role]}</span>
            <Link
              to="/sandbox"
              className="rounded-lg bg-sand-200 px-4 py-2 text-sm font-medium text-espresso-900 transition-colors hover:bg-sand-300"
            >
              Partner Sandbox
            </Link>
=======
            {logoutError && <p className="text-sm text-danger" role="alert">{logoutError}</p>}
            <button className="relative rounded-full p-2 text-espresso-700 hover:bg-cream-200">
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-cream-50" />
            </button>
            <button className="rounded-lg bg-sand-200 px-4 py-2 text-sm font-medium text-espresso-900 transition-colors hover:bg-sand-300">
              ช่วยเหลือ
            </button>
>>>>>>> 6aca8a91bcd6df99dcd651a81e703215097c3458:frontend/src/layouts/DashboardLayout.tsx
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
