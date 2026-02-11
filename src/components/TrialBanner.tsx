import { Link } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import './TrialBanner.css';

export default function TrialBanner() {
  const { isTrialing, trialDaysRemaining } = useOrganization();

  if (!isTrialing || trialDaysRemaining <= 0) return null;

  const isUrgent = trialDaysRemaining <= 2;
  const daysText = trialDaysRemaining === 1 ? '1 day' : `${trialDaysRemaining} days`;

  return (
    <div className={`trial-banner ${isUrgent ? 'trial-banner-urgent' : ''}`}>
      <div className="trial-banner-content">
        <span className="trial-banner-text">
          <svg className="trial-banner-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {isUrgent ? (
            <>
              <strong>Hurry! {daysText} left</strong> in your free trial.{' '}
              <Link to="/billing" className="trial-banner-cta">
                Subscribe now and save 10% on Starter
              </Link>
            </>
          ) : (
            <>
              <strong>{daysText} left</strong> in your free trial — {' '}
              <Link to="/billing" className="trial-banner-cta">
                Subscribe before it ends and save 10% on Starter
              </Link>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
