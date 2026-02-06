import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { OrganizationProvider } from './contexts/OrganizationContext';
import MainLayout from './components/MainLayout';
import AdminLayout from './components/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import SuperAdminRoute from './components/SuperAdminRoute';
import Dashboard from './pages/Dashboard';
import Channels from './pages/Channels';
import MetaAds from './pages/MetaAds';

import Products from './pages/Products';
import Insights from './pages/Insights';
import AdGenerator from './pages/AdGenerator';
import AdPublisher from './pages/AdPublisher';
import Funnels from './pages/Funnels';
import SeoIQ from './pages/SeoIQ';
import Billing from './pages/Billing';
import AccountSettings from './pages/AccountSettings';
import SalesLanding from './pages/SalesLanding';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminDashboard from './pages/admin/AdminDashboard';
import OrganizationsList from './pages/admin/OrganizationsList';
import CreateOrganization from './pages/admin/CreateOrganization';
import OrganizationDetail from './pages/admin/OrganizationDetail';
import './App.css';

// Layout wrapper for admin section
function AdminWrapper() {
  return (
    <ProtectedRoute>
      <OrganizationProvider>
        <SuperAdminRoute>
          <AdminLayout />
        </SuperAdminRoute>
      </OrganizationProvider>
    </ProtectedRoute>
  );
}

// Layout wrapper for main app
function AppWrapper() {
  return (
    <ProtectedRoute>
      <OrganizationProvider>
        <MainLayout />
      </OrganizationProvider>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<SalesLanding />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Admin Routes */}
          <Route path="/admin" element={<AdminWrapper />}>
            <Route index element={<AdminDashboard />} />
            <Route path="organizations" element={<OrganizationsList />} />
            <Route path="organizations/new" element={<CreateOrganization />} />
            <Route path="organizations/:id" element={<OrganizationDetail />} />
          </Route>

          {/* Protected App Routes */}
          <Route element={<AppWrapper />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/channels/meta-ads" element={<MetaAds />} />
            <Route path="/creatives" element={<AdGenerator />} />
            <Route path="/publish" element={<AdPublisher />} />

            <Route path="/products" element={<Products />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/seo-iq" element={<SeoIQ />} />
            <Route path="/funnels" element={<Funnels />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/account" element={<AccountSettings />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
