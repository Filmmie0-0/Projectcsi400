import { Link, Outlet } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { ROLE_HOME } from './navigation/menus';

export default function PublicLayout() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="min-h-screen bg-cream-50">
      <header className="sticky top-0 z-30 border-b border-line bg-cream-50/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2 font-semibold text-espresso-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-walnut-500">
              <Hammer className="h-5 w-5 text-cream-50" />
            </span>
            RenoCare
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            {/* ลิงก์ไปยังแต่ละส่วนของหน้าแรก (/#id ใช้ได้จากทุกหน้าใน public layout) */}
            {[
              ['/#services', 'บริการ'],
              ['/#portfolio', 'ผลงาน'],
              ['/#contact', 'ติดต่อ'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="hidden rounded-lg px-3 py-2 text-espresso-700 hover:bg-cream-200 md:block">{label}</a>
            ))}
            <Link to="/sandbox" className="hidden rounded-lg px-3 py-2 text-espresso-700 hover:bg-cream-200 sm:block">Partner Sandbox</Link>
            {user ? (
              <Link to={ROLE_HOME[user.role]} className="rounded-lg bg-walnut-500 px-4 py-2 font-medium text-cream-50 hover:bg-walnut-600">แดชบอร์ด</Link>
            ) : (
              <Link to="/login" className="rounded-lg bg-walnut-500 px-4 py-2 font-medium text-cream-50 hover:bg-walnut-600">เข้าสู่ระบบ</Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        <Outlet />
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-espresso-500">
        © RenoCare — รับซ่อม รีโนเวท ต่อเติม บ้าน คอนโด หอพัก · ทำงานร่วมกับระบบจองห้องพักพาร์ทเนอร์
        <p className="mt-1 text-espresso-300">ภาพประกอบจาก Unsplash</p>
      </footer>
    </div>
  );
}
