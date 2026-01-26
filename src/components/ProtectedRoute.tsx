import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * ProtectedRoute - Guards authenticated routes
 *
 * Currently uses localStorage for stub authentication.
 * Replace isAuthenticated() with your auth provider:
 *
 * Examples:
 * - Clerk: useAuth().isSignedIn
 * - Auth0: useAuth0().isAuthenticated
 * - Firebase: useAuthState(auth)[0]
 * - Custom: useContext(AuthContext).user
 */
function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();

  // Stub auth check - replace with real auth provider
  const isAuthenticated = () => {
    return localStorage.getItem('convertra_authenticated') === 'true';
  };

  if (!isAuthenticated()) {
    // Redirect to login, preserving the intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
