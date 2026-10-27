import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100 px-4">
      <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-y-auto rounded-card border border-line bg-white p-8 shadow-soft">
        <Outlet />
      </div>
    </div>
  );
}
