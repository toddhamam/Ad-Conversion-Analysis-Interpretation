import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Stub authentication - replace with real auth provider
    // For now, accept any credentials to demo the flow
    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      // Store auth state (replace with real token storage)
      localStorage.setItem('convertra_authenticated', 'true');

      // Check if user data exists, if not create default from email
      const existingUser = localStorage.getItem('convertra_user');
      if (!existingUser) {
        // Extract name from email for demo purposes
        const namePart = email.split('@')[0];
        const formattedName = namePart
          .replace(/[._-]/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        const domain = email.split('@')[1]?.split('.')[0] || 'Company';
        const companyName = domain.charAt(0).toUpperCase() + domain.slice(1);

        localStorage.setItem('convertra_user', JSON.stringify({
          fullName: formattedName,
          companyName: companyName,
          email: email,
        }));
      }

      navigate('/dashboard');
    } catch {
      setError('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <Link to="/" className="login-logo">
              <img src="/convertra-logo.png" alt="Convertra" />
            </Link>
            <p className="login-subtitle">Sign in to your account</p>
          </div>

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
              <label htmlFor="email">Email address</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            <div className="form-options">
              <label className="remember-me">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <a href="#" className="forgot-password">Forgot password?</a>
            </div>

            <button type="submit" className="login-button" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="login-spinner"></span>
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="login-footer">
            <p>
              Don't have an account?{' '}
              <Link to="/signup" className="signup-link">Create one</Link>
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

export default Login;
