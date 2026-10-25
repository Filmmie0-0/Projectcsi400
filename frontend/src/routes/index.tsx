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
const SpaceSearchPage = lazy(() => import('../pages/public/SpaceSearchPage'));
const SpaceDetailPage = lazy(() => import('../pages/public/SpaceDetailPage'));
const ApiSandboxPage = lazy(() => import('../pages/public/ApiSandboxPage'));
const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage'));

const AdminDashboardPage = lazy(() => import('../pages/admin/AdminDashboardPage'));
const UserManagementPage = lazy(() => import('../pages/admin/UserManagementPage'));
const SpaceApprovalPage = lazy(() => import('../pages/admin/SpaceApprovalPage'));
const BookingOverviewPage = lazy(() => import('../pages/admin/BookingOverviewPage'));
const PaymentVerifyPage = lazy(() => import('../pages/admin/PaymentVerifyPage'));

const OwnerDashboardPage = lazy(() => import('../pages/owner/OwnerDashboardPage'));
const MySpacesPage = lazy(() => import('../pages/owner/MySpacesPage'));
const SpaceFormPage = lazy(() => import('../pages/owner/SpaceFormPage'));
const BookingRequestsPage = lazy(() => import('../pages/owner/BookingRequestsPage'));
const OwnerBookingDetailPage = lazy(() => import('../pages/owner/OwnerBookingDetailPage'));

const TenantDashboardPage = lazy(() => import('../pages/tenant/TenantDashboardPage'));
const MyBookingsPage = lazy(() => import('../pages/tenant/MyBookingsPage'));
const BookingDetailPage = lazy(() => import('../pages/tenant/BookingDetailPage'));
const ProfilePage = lazy(() => import('../pages/tenant/ProfilePage'));
const ProductListPage = lazy(() => import('../pages/tenant/inventory/ProductListPage'));
const ProductFormPage = lazy(() => import('../pages/tenant/inventory/ProductFormPage'));
const StockMovementPage = lazy(() => import('../pages/tenant/inventory/StockMovementPage'));
const TransactionHistoryPage = lazy(() => import('../pages/tenant/inventory/TransactionHistoryPage'));
const StoreInventoryManager = lazy(() => import('../pages/tenant/store/StoreInventoryManager'));

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: L(<LandingPage />) },
      { path: '/spaces', element: L(<SpaceSearchPage />) },
      { path: '/spaces/:id', element: L(<SpaceDetailPage />) },
      { path: '/sandbox', element: L(<ApiSandboxPage />) },
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
          {
            element: <RoleRoute allow={['ADMIN']} />,
            children: [
              { path: '/admin', element: L(<AdminDashboardPage />) },
              { path: '/admin/users', element: L(<UserManagementPage />) },
              { path: '/admin/spaces', element: L(<SpaceApprovalPage />) },
              { path: '/admin/bookings', element: L(<BookingOverviewPage />) },
              { path: '/admin/payments', element: L(<PaymentVerifyPage />) },
            ],
          },
          {
            element: <RoleRoute allow={['OWNER']} />,
            children: [
              { path: '/owner', element: L(<OwnerDashboardPage />) },
              { path: '/owner/spaces', element: L(<MySpacesPage />) },
              { path: '/owner/spaces/new', element: L(<SpaceFormPage />) },
              { path: '/owner/spaces/:id/edit', element: L(<SpaceFormPage />) },
              { path: '/owner/bookings', element: L(<BookingRequestsPage />) },
              { path: '/owner/bookings/:id', element: L(<OwnerBookingDetailPage />) },
            ],
          },
          {
            element: <RoleRoute allow={['TENANT']} />,
            children: [
              { path: '/tenant', element: L(<TenantDashboardPage />) },
              { path: '/tenant/bookings', element: L(<MyBookingsPage />) },
              { path: '/tenant/bookings/:id', element: L(<BookingDetailPage />) },
              { path: '/tenant/store', element: L(<StoreInventoryManager />) },
              { path: '/tenant/inventory/products', element: L(<ProductListPage />) },
              { path: '/tenant/inventory/products/new', element: L(<ProductFormPage />) },
              { path: '/tenant/inventory/products/:id/edit', element: L(<ProductFormPage />) },
              { path: '/tenant/inventory/movements', element: L(<StockMovementPage />) },
              { path: '/tenant/inventory/history', element: L(<TransactionHistoryPage />) },
              { path: '/tenant/profile', element: L(<ProfilePage />) },
            ],
          },
        ],
      },
    ],
  },
]);
