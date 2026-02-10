import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import './Register.css';

function Register() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [formData, setFormData] = useState({
    companyName: '',
    fullName: '',
    role: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [signupComplete, setSignupComplete] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const { error: signUpError, confirmationPending } = await signUp(formData.email, formData.password, {
        full_name: formData.fullName,
        company_name: formData.companyName,
      });

      if (signUpError) {
        const msg = signUpError.message || '';
        if (msg.toLowerCase().includes('rate limit')) {
          setError('Too many sign-up attempts. Please wait a few minutes and try again.');
        } else {
          setError(msg || 'Registration failed. Please try again.');
        }
        return;
      }

      if (confirmationPending) {
        setSubmittedEmail(formData.email);
        setSignupComplete(true);
      } else {
        // Dev mode — no email confirmation needed
        navigate('/dashboard');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="register-page">
      <SEO
        title="Create Account"
        description="Create your Convertra account to access ConversionIQ™ - the conversion intelligence platform that generates winning ads automatically."
        canonical="/signup"
        noindex={true}
      />
      <div className="register-container">
        <div className="register-card">
          <div className="register-header">
            <Link to="/" className="register-logo">
              <img src="/convertra-logo.png" alt="Convertra" />
            </Link>
            {!signupComplete && (
              <>
                <h1 className="register-title">Create your account</h1>
                <p className="register-subtitle">Start optimizing your ad performance with ConversionIQ™</p>
              </>
            )}
          </div>

          {signupComplete ? (
            <div className="register-success">
              <div className="success-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3>Check your email</h3>
              <p>
                We've sent a confirmation link to <strong>{submittedEmail}</strong>.
                Click the link in the email to activate your account and start exploring.
              </p>
              <p className="email-note">
                Didn't receive the email? Check your spam folder or{' '}
                <button
                  type="button"
                  className="resend-link"
                  onClick={() => setSignupComplete(false)}
                >
                  try again
                </button>
              </p>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="register-form">
                {error && (
                  <div className="register-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {error}
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="companyName">Company name</label>
                  <input
                    type="text"
                    id="companyName"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleChange}
                    placeholder="Acme Inc."
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="fullName">Your name</label>
                  <input
                    type="text"
                    id="fullName"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    placeholder="Jane Smith"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="role">Your role</label>
                  <input
                    type="text"
                    id="role"
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    placeholder="CEO, CMO, VP Marketing, etc."
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Work email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="jane@company.com"
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="confirmPassword">Confirm</label>
                    <input
                      type="password"
                      id="confirmPassword"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <p className="password-hint">Minimum 8 characters</p>

                <div className="form-terms">
                  <label className="terms-checkbox">
                    <input type="checkbox" required />
                    <span>
                      I agree to the{' '}
                      <a href="#" className="terms-link">Terms of Service</a>
                      {' '}and{' '}
                      <a href="#" className="terms-link">Privacy Policy</a>
                    </span>
                  </label>
                </div>

                <button type="submit" className="register-button" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <span className="register-spinner"></span>
                      Creating account...
                    </>
                  ) : (
                    'Create account'
                  )}
                </button>
              </form>

              <div className="register-footer">
                <p>
                  Already have an account?{' '}
                  <Link to="/login" className="login-link">Sign in</Link>
                </p>
              </div>
            </>
          )}
        </div>

        <p className="register-tagline">
          Powered by <span className="brand-highlight">ConversionIQ™</span>
        </p>
      </div>
    </div>
  );
}

export default Register;
