import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import './TrialBanner.css';

export default function TrialBanner() {
  const { isTrialing, trialDaysRemaining } = useOrganization();
  const [dismissed, setDismissed] = useState(false);

  if (!isTrialing || trialDaysRemaining <= 0 || dismissed) return null;

  const isUrgent = trialDaysRemaining <= 2;
  const daysText = trialDaysRemaining === 1 ? '1 day' : `${trialDaysRemaining} days`;

  return (
    <div className={`trial-banner ${isUrgent ? 'trial-banner-urgent' : ''}`}>
      <div className="trial-banner-content">
        <span className="trial-banner-text">
          <strong>{daysText} left</strong> in your free trial.{' '}
          <Link to="/billing" className="trial-banner-cta">
            Subscribe now and lock in $89/month
          </Link>
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="trial-banner-dismiss"
          aria-label="Dismiss trial banner"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
