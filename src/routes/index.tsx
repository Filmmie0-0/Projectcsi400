import { lazy, Suspense } from 'react';
import type { ReactElement } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import AuthLayout from '../layouts/AuthLayout';
import DashboardLayout from '../layouts/DashboardLayout';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';

const L = (el: ReactElement) => (
  <Suspense fallback={<div className="p-8 text-espresso-500">กำลังโหลด...</div>}>{el}</Suspense>
);

const LandingPage = lazy(() => import('../pages/public/LandingPage'));
const PartnerSandboxPage = lazy(() => import('../pages/public/PartnerSandboxPage'));
const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage'));

// หน้าที่ใช้ร่วมกันหลาย role (เนื้อหาเปลี่ยนตาม role)
const JobListPage = lazy(() => import('../pages/jobs/JobListPage'));
const JobDetailPage = lazy(() => import('../pages/jobs/JobDetailPage'));
const BillingPage = lazy(() => import('../pages/billing/BillingPage'));
const RequisitionsPage = lazy(() => import('../pages/inventory/RequisitionsPage'));

const AdminDashboardPage = lazy(() => import('../pages/admin/AdminDashboardPage'));
const UsersPage = lazy(() => import('../pages/admin/UsersPage'));
const PartnersPage = lazy(() => import('../pages/admin/PartnersPage'));
const MaterialsPage = lazy(() => import('../pages/inventory/MaterialsPage'));

const UserDashboardPage = lazy(() => import('../pages/user/UserDashboardPage'));
const NewJobPage = lazy(() => import('../pages/user/NewJobPage'));

const TechDashboardPage = lazy(() => import('../pages/technician/TechDashboardPage'));

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: L(<LandingPage />) },
      { path: '/sandbox', element: L(<PartnerSandboxPage />) },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: L(<LoginPage />) },
      { path: '/register', element: L(<RegisterPage />) },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: '/jobs', element: L(<JobListPage />) },
          { path: '/jobs/:id', element: L(<JobDetailPage />) },
          {
            element: <RoleRoute allow={['ADMIN', 'USER']} />,
            children: [{ path: '/billing', element: L(<BillingPage />) }],
          },
          {
            element: <RoleRoute allow={['ADMIN', 'TECHNICIAN']} />,
            children: [{ path: '/requisitions', element: L(<RequisitionsPage />) }],
          },
          {
            element: <RoleRoute allow={['ADMIN']} />,
            children: [
              { path: '/admin', element: L(<AdminDashboardPage />) },
              { path: '/admin/users', element: L(<UsersPage />) },
              { path: '/admin/partners', element: L(<PartnersPage />) },
              { path: '/admin/materials', element: L(<MaterialsPage />) },
            ],
          },
          {
            element: <RoleRoute allow={['USER']} />,
            children: [
              { path: '/user', element: L(<UserDashboardPage />) },
              { path: '/user/jobs/new', element: L(<NewJobPage />) },
            ],
          },
          {
            element: <RoleRoute allow={['TECHNICIAN']} />,
            children: [{ path: '/tech', element: L(<TechDashboardPage />) }],
          },
        ],
      },
    ],
  },
]);
