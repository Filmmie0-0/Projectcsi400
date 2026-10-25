import { Link, Outlet } from 'react-router-dom';
import { Warehouse } from 'lucide-react';

export default function PublicLayout() {
  return (
    <div className="min-h-screen bg-cream-50">
      <header className="border-b border-line bg-cream-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2 font-semibold text-espresso-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-walnut-500">
              <Warehouse className="h-5 w-5 text-cream-50" />
            </span>
            MicroFulfill
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/spaces" className="rounded-lg px-3 py-2 text-espresso-700 hover:bg-cream-200">ค้นหาพื้นที่</Link>
            <Link to="/sandbox" className="rounded-lg px-3 py-2 text-espresso-700 hover:bg-cream-200">API Sandbox</Link>
            <Link to="/login" className="rounded-lg bg-walnut-500 px-4 py-2 font-medium text-cream-50 hover:bg-walnut-600">เข้าสู่ระบบ</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        <Outlet />
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-espresso-500">
        © MicroFulfill
      </footer>
    </div>
  );
}
