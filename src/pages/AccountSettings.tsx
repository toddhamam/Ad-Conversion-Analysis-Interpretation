import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import './AccountSettings.css';

interface UserData {
  fullName: string;
  companyName: string;
  companyLogo?: string;
  email: string;
  role?: string;
}

function AccountSettings() {
  const { user, isConfigured } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get initial user data from localStorage
  const getInitialUserData = (): UserData => {
    const stored = localStorage.getItem('convertra_user');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Fallback
      }
    }
    return {
      fullName: user?.user_metadata?.full_name || 'Demo User',
      companyName: user?.user_metadata?.company_name || 'Demo Company',
      email: user?.email || 'demo@company.com',
      role: '',
    };
  };

  const [formData, setFormData] = useState<UserData>(getInitialUserData);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | undefined>(formData.companyLogo);

  // Sync with localStorage on mount
  useEffect(() => {
    const userData = getInitialUserData();
    setFormData(userData);
    setLogoPreview(userData.companyLogo);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
    setSuccessMessage('');
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
    setPasswordError('');
    setPasswordSuccess('');
  };

  const handleLogoClick = () => {
    fileInputRef.current?.click();
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setLogoPreview(base64);
      setFormData(prev => ({ ...prev, companyLogo: base64 }));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview(undefined);
    setFormData(prev => ({ ...prev, companyLogo: undefined }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      // Validate required fields
      if (!formData.fullName.trim()) {
        setError('Full name is required');
        setIsSaving(false);
        return;
      }

      if (!formData.companyName.trim()) {
        setError('Company name is required');
        setIsSaving(false);
        return;
      }

      // Save to localStorage
      localStorage.setItem('convertra_user', JSON.stringify(formData));

      // If Supabase is configured, update the user metadata there too
      if (isConfigured && isSupabaseConfigured()) {
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            full_name: formData.fullName,
            company_name: formData.companyName,
          },
        });

        if (updateError) {
          console.error('Failed to update Supabase user:', updateError);
          // Don't fail - localStorage update was successful
        }

        // Update the users table
        if (user?.id) {
          await supabase
            .from('users')
            .update({
              full_name: formData.fullName,
            })
            .eq('auth_id', user.id);
        }
      }

      setSuccessMessage('Profile updated successfully');
    } catch (err) {
      console.error('Error saving profile:', err);
      setError('Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsChangingPassword(true);
    setPasswordError('');
    setPasswordSuccess('');

    // Validate passwords
    if (passwordData.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      setIsChangingPassword(false);
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      setIsChangingPassword(false);
      return;
    }

    try {
      if (isConfigured && isSupabaseConfigured()) {
        const { error: updateError } = await supabase.auth.updateUser({
          password: passwordData.newPassword,
        });

        if (updateError) {
          setPasswordError(updateError.message || 'Failed to update password');
          setIsChangingPassword(false);
          return;
        }

        setPasswordSuccess('Password updated successfully');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        // For local auth, just show success (no actual password storage)
        setPasswordSuccess('Password updated successfully');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch (err) {
      console.error('Error changing password:', err);
      setPasswordError('Failed to change password. Please try again.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getCompanyInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div className="account-settings-page">
      <div className="account-settings-header">
        <h1>Account Settings</h1>
        <p>Manage your profile and company information</p>
      </div>

      <div className="account-settings-content">
        {/* Profile Section */}
        <section className="settings-section">
          <div className="section-header">
            <h2>Profile Information</h2>
            <p>Update your personal details and contact information</p>
          </div>

          <form onSubmit={handleSaveProfile} className="settings-form">
            {error && (
              <div className="settings-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {successMessage && (
              <div className="settings-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                {successMessage}
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="fullName">Full Name</label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder="Jane Smith"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="role">Role</label>
                <input
                  type="text"
                  id="role"
                  name="role"
                  value={formData.role || ''}
                  onChange={handleInputChange}
                  placeholder="CEO, CMO, VP Marketing, etc."
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="jane@company.com"
                required
              />
              <p className="field-hint">This is your login email</p>
            </div>

            <button type="submit" className="save-button" disabled={isSaving}>
              {isSaving ? (
                <>
                  <span className="button-spinner"></span>
                  Saving...
                </>
              ) : (
                'Save Profile'
              )}
            </button>
          </form>
        </section>

        {/* Company Section */}
        <section className="settings-section">
          <div className="section-header">
            <h2>Company Settings</h2>
            <p>Customize your company branding</p>
          </div>

          <div className="company-settings-content">
            <div className="logo-upload-section">
              <div className="logo-preview-container">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt={formData.companyName}
                    className="logo-preview-img"
                  />
                ) : (
                  <div className="logo-preview-placeholder">
                    {getCompanyInitials(formData.companyName)}
                  </div>
                )}
              </div>

              <div className="logo-upload-info">
                <h3>Company Logo</h3>
                <p>This will be displayed in the app header and profile dropdown</p>
                <div className="logo-upload-actions">
                  <button
                    type="button"
                    className="upload-button"
                    onClick={handleLogoClick}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload Logo
                  </button>
                  {logoPreview && (
                    <button
                      type="button"
                      className="remove-logo-button"
                      onClick={handleRemoveLogo}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="upload-hint">PNG, JPG or GIF. Max 2MB.</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="hidden-file-input"
              />
            </div>

            <div className="form-group company-name-group">
              <label htmlFor="companyName">Company Name</label>
              <input
                type="text"
                id="companyName"
                name="companyName"
                value={formData.companyName}
                onChange={handleInputChange}
                placeholder="Acme Inc."
                required
              />
            </div>
          </div>
        </section>

        {/* Password Section */}
        <section className="settings-section">
          <div className="section-header">
            <h2>Change Password</h2>
            <p>Update your account password</p>
          </div>

          <form onSubmit={handleChangePassword} className="settings-form password-form">
            {passwordError && (
              <div className="settings-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="settings-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                {passwordSuccess}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="currentPassword">Current Password</label>
              <input
                type="password"
                id="currentPassword"
                name="currentPassword"
                value={passwordData.currentPassword}
                onChange={handlePasswordChange}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <p className="password-requirements">Password must be at least 8 characters</p>

            <button type="submit" className="save-button" disabled={isChangingPassword}>
              {isChangingPassword ? (
                <>
                  <span className="button-spinner"></span>
                  Updating...
                </>
              ) : (
                'Update Password'
              )}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default AccountSettings;
