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
import Integrations from './pages/Integrations';
import SalesLanding from './pages/SalesLanding';
import Login from './pages/Login';
import Register from './pages/Register';
import ChoosePlan from './pages/ChoosePlan';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import CookiePolicy from './pages/CookiePolicy';
import DataDeletion from './pages/DataDeletion';
import AdminDashboard from './pages/admin/AdminDashboard';
import OrganizationsList from './pages/admin/OrganizationsList';
import CreateOrganization from './pages/admin/CreateOrganization';
import OrganizationDetail from './pages/admin/OrganizationDetail';
import './App.css';

// Simple 404 page
function NotFound() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-secondary, #f8fafc)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <h1 style={{ fontSize: '72px', fontWeight: 700, color: 'var(--text-primary, #1e293b)', margin: 0 }}>404</h1>
      <p style={{ fontSize: '18px', color: 'var(--text-secondary, #475569)', marginTop: '8px' }}>Page not found</p>
      <a href="/dashboard" style={{ marginTop: '24px', padding: '12px 28px', background: 'var(--accent-primary, #d4e157)', color: '#1e293b', borderRadius: '8px', textDecoration: 'none', fontWeight: 600 }}>Go to Dashboard</a>
    </div>
  );
}

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
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/cookies" element={<CookiePolicy />} />
          <Route path="/data-deletion" element={<DataDeletion />} />

          {/* Post-Signup Plan Selection (protected, no sidebar) */}
          <Route path="/choose-plan" element={
            <ProtectedRoute>
              <OrganizationProvider>
                <ChoosePlan />
              </OrganizationProvider>
            </ProtectedRoute>
          } />

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
            <Route path="/funnels" element={<SuperAdminRoute><Funnels /></SuperAdminRoute>} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/account" element={<AccountSettings />} />
            <Route path="/integrations" element={<Integrations />} />
          </Route>

          {/* Catch-all 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
