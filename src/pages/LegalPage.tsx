import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import './LegalPage.css';

interface LegalPageProps {
  title: string;
  description: string;
  canonical: string;
  children: React.ReactNode;
}

export default function LegalPage({ title, description, canonical, children }: LegalPageProps) {
  return (
    <div className="legal-page">
      <SEO title={title} description={description} canonical={canonical} />

      <header className="legal-header">
        <div className="legal-header-inner">
          <Link to="/" className="legal-logo">Convertra</Link>
          <Link to="/" className="legal-back-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Home
          </Link>
        </div>
      </header>

      <main className="legal-content">
        <div className="legal-content-inner">
          <h1 className="legal-title">{title}</h1>
          {children}
        </div>
      </main>

      <footer className="legal-footer">
        <div className="legal-footer-inner">
          <div className="legal-footer-links">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/cookies">Cookie Policy</Link>
            <Link to="/data-deletion">Data Deletion</Link>
          </div>
          <p className="legal-footer-copyright">
            &copy; {new Date().getFullYear()} Convertra. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
