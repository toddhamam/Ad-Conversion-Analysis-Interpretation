import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseCreditPack } from '../services/stripeApi';
import './CreditExhaustionModal.css';

interface CreditExhaustionModalProps {
  creditsRemaining: number;
  creditsRequired: number;
  onClose: () => void;
}

const CREDIT_PACKS = [
  { id: '50' as const, credits: 50, price: 29, equivalent: '= 50 image ads or 10 video ads' },
  { id: '100' as const, credits: 100, price: 49, equivalent: '= 100 image ads or 20 video ads' },
  { id: '250' as const, credits: 250, price: 99, equivalent: '= 250 image ads or 50 video ads' },
];

export default function CreditExhaustionModal({ creditsRemaining, creditsRequired, onClose }: CreditExhaustionModalProps) {
  const navigate = useNavigate();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  async function handleBuyPack(packId: '50' | '100' | '250') {
    try {
      setPurchasing(packId);
      await purchaseCreditPack(packId);
    } catch {
      setPurchasing(null);
    }
  }

  return (
    <div className="credit-modal-overlay" onClick={onClose}>
      <div className="credit-modal" onClick={e => e.stopPropagation()}>
        <button className="credit-modal-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="credit-modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>

        <h2 className="credit-modal-title">Not enough credits</h2>
        <p className="credit-modal-desc">
          This action requires <strong>{creditsRequired} credits</strong> but you only have <strong>{creditsRemaining} remaining</strong> this month.
        </p>

        <div className="credit-modal-options">
          <button
            className="credit-modal-upgrade"
            onClick={() => { onClose(); navigate('/billing'); }}
          >
            Upgrade Plan
          </button>

          <div className="credit-modal-divider">
            <span>or buy a credit pack</span>
          </div>

          <div className="credit-modal-packs">
            {CREDIT_PACKS.map(pack => (
              <button
                key={pack.id}
                className="credit-pack-card"
                onClick={() => handleBuyPack(pack.id)}
                disabled={purchasing !== null}
              >
                <div className="credit-pack-credits">{pack.credits} credits</div>
                <div className="credit-pack-equivalent">{pack.equivalent}</div>
                <div className="credit-pack-price">
                  {purchasing === pack.id ? 'Redirecting...' : `$${pack.price}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
