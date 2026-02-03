import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import './Login.css';

function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword, session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if user has a valid session (established by clicking the email link)
    // Supabase automatically handles the token from the URL hash
    const checkSession = async () => {
      // Give Supabase a moment to process the URL hash and establish session
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsValidSession(!!session);
    };
    checkSession();
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await updatePassword(password);

      if (updateError) {
        setError(updateError.message || 'Failed to update password');
        return;
      }

      setSuccess(true);
      // Redirect to dashboard after success
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 2000);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Still checking session
  if (isValidSession === null) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-card">
            <div className="login-header">
              <Link to="/" className="login-logo">
                <img src="/convertra-logo.png" alt="Convertra" />
              </Link>
              <p className="login-subtitle">Verifying reset link...</p>
            </div>
            <div className="reset-loading">
              <span className="login-spinner"></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Invalid or expired link
  if (!isValidSession) {
    return (
      <div className="login-page">
        <SEO
          title="Reset Password"
          description="Reset your Convertra account password."
          canonical="/reset-password"
          noindex={true}
        />
        <div className="login-container">
          <div className="login-card">
            <div className="login-header">
              <Link to="/" className="login-logo">
                <img src="/convertra-logo.png" alt="Convertra" />
              </Link>
              <p className="login-subtitle">Reset your password</p>
            </div>

            <div className="reset-expired">
              <div className="expired-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h3>Invalid or expired link</h3>
              <p>
                This password reset link is invalid or has expired. Please request a new one.
              </p>
              <Link to="/forgot-password" className="login-button" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                Request new link
              </Link>
            </div>

            <div className="login-footer">
              <p>
                Remember your password?{' '}
                <Link to="/login" className="signup-link">Sign in</Link>
              </p>
            </div>
          </div>

          <p className="login-tagline">
            Powered by <span className="brand-highlight">ConversionIQ™</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <SEO
        title="Set New Password"
        description="Set a new password for your Convertra account."
        canonical="/reset-password"
        noindex={true}
      />
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <Link to="/" className="login-logo">
              <img src="/convertra-logo.png" alt="Convertra" />
            </Link>
            <p className="login-subtitle">Set a new password</p>
          </div>

          {success ? (
            <div className="reset-success">
              <div className="success-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3>Password updated</h3>
              <p>
                Your password has been successfully updated. Redirecting you to the dashboard...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="login-form">
              {error && (
                <div className="login-error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {error}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="password">New password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm new password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              <p className="password-requirements">
                Password must be at least 8 characters
              </p>

              <button type="submit" className="login-button" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <span className="login-spinner"></span>
                    Updating...
                  </>
                ) : (
                  'Update password'
                )}
              </button>
            </form>
          )}
        </div>

        <p className="login-tagline">
          Powered by <span className="brand-highlight">ConversionIQ™</span>
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;
