import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100 px-4">
      <div className="w-full max-w-md rounded-card border border-line bg-white p-8 shadow-soft">
        <Outlet />
      </div>
    </div>
  );
}
