import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useOrganization } from '../contexts/OrganizationContext';
import Loading from './Loading';

interface SuperAdminRouteProps {
  children: ReactNode;
}

/**
 * SuperAdminRoute - Guards admin routes for platform administrators only
 *
 * Only users with is_super_admin = true can access admin routes.
 * Regular users are redirected to the dashboard.
 */
function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const location = useLocation();
  const { user, loading, isSuperAdmin } = useOrganization();

  // Show loading state while checking permissions
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-secondary, #f8fafc)',
      }}>
        <Loading size="large" message="ConversionIQ™ verifying access..." />
      </div>
    );
  }

  // User must be authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // User must be a super admin
  if (!isSuperAdmin) {
    // Redirect regular users to dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default SuperAdminRoute;
