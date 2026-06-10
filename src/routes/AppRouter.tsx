import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import DashboardPage from '../pages/DashboardPage';
import LoginPage from '../pages/LoginPage';
import OrdersPage from '../pages/OrdersPage';
import ProductsPage from '../pages/ProductsPage';
import CategoriesPage from '../pages/CategoriesPage';
import ReviewsPage from '../pages/ReviewsPage';
import AnalyticsPage from '../pages/AnalyticsPage';
import MarketingPage from '../pages/MarketingPage';
import SettingsPage from '../pages/SettingsPage';
import ProtectedRoute from './ProtectedRoute';
import PublicRoute from './PublicRoute';

const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    ),
  },
  {
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/orders', element: <OrdersPage /> },
      { path: '/products', element: <ProductsPage /> },
      { path: '/categories', element: <CategoriesPage /> },
      { path: '/reviews', element: <ReviewsPage /> },
      { path: '/analytics', element: <AnalyticsPage /> },
      { path: '/marketing', element: <MarketingPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
