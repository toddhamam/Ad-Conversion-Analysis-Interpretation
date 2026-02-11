import LegalPage from './LegalPage';

export default function DataDeletion() {
  return (
    <LegalPage
      title="Data Deletion"
      description="Request deletion of your Convertra account and associated data."
      canonical="/data-deletion"
    >
      <p className="legal-effective-date">Effective Date: February 11, 2026</p>

      <p>
        Convertra respects your right to control your personal data. This page explains how to
        request deletion of your data from our platform.
      </p>

      <h2>1. What Data We Store</h2>
      <p>When you use Convertra, we store the following data associated with your account:</p>
      <ul>
        <li><strong>Account information:</strong> Name, email address, company name, and login credentials</li>
        <li><strong>Organization settings:</strong> Company branding, subscription details, and configuration</li>
        <li><strong>Meta API credentials:</strong> Encrypted access tokens and ad account identifiers (we do not store your Facebook password)</li>
        <li><strong>Product data:</strong> Product names, descriptions, and uploaded mockup images</li>
        <li><strong>SEO IQ data:</strong> Connected sites, keywords, and generated articles</li>
      </ul>
      <p>
        We do <strong>not</strong> permanently store your Meta ad campaign data, ad creative content,
        or performance metrics on our servers. This data is accessed in real-time from Meta's API and
        cached temporarily for display purposes only.
      </p>

      <h2>2. How to Request Data Deletion</h2>

      <h3>Option A: Email Request</h3>
      <p>
        Send an email to{' '}
        <a href="mailto:privacy@convertraiq.com">privacy@convertraiq.com</a>{' '}
        with the subject line <strong>"Data Deletion Request"</strong> and include:
      </p>
      <ul>
        <li>Your account email address</li>
        <li>Your company/organization name</li>
        <li>Whether you want full account deletion or deletion of specific data only</li>
      </ul>

      <h3>Option B: In-App Request</h3>
      <p>
        You can request account deletion from your Account Settings page within the Convertra
        dashboard. Navigate to <strong>Account Settings</strong> and use the account deletion option.
      </p>

      <h2>3. What Happens When You Request Deletion</h2>
      <p>Upon receiving a valid deletion request, we will:</p>
      <ol>
        <li>Verify your identity to prevent unauthorized deletion requests</li>
        <li>Delete your account and all associated personal data within <strong>30 days</strong></li>
        <li>Revoke and delete any stored Meta API access tokens</li>
        <li>Delete any product data and uploaded images</li>
        <li>Remove your organization's configuration and settings</li>
        <li>Cancel any active subscription (you will not be charged again after deletion)</li>
        <li>Send you a confirmation email once deletion is complete</li>
      </ol>

      <h2>4. Data We May Retain</h2>
      <p>
        Even after account deletion, we may retain certain data as required by law or for legitimate
        business purposes:
      </p>
      <ul>
        <li><strong>Billing records:</strong> Transaction history may be retained for tax and accounting purposes as required by law</li>
        <li><strong>Legal compliance:</strong> Data necessary to comply with legal obligations, resolve disputes, or enforce agreements</li>
        <li><strong>Aggregated data:</strong> Anonymized, aggregated statistics that cannot identify you individually</li>
      </ul>

      <h2>5. Disconnecting Meta Without Deleting Your Account</h2>
      <p>
        If you want to revoke Convertra's access to your Meta data without deleting your entire
        account, you can:
      </p>
      <ul>
        <li>
          Remove Convertra from your{' '}
          <a href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noopener noreferrer">
            Facebook Business Integrations
          </a>{' '}
          settings
        </li>
        <li>Contact us to disconnect your Meta credentials from your Convertra organization</li>
      </ul>

      <h2>6. Facebook Data Deletion Callback</h2>
      <p>
        In compliance with Meta Platform requirements, when you remove the Convertra app from your
        Facebook account, we receive a data deletion callback from Meta. Upon receiving this
        callback, we automatically delete your stored Meta API credentials and any cached data
        associated with your Facebook account.
      </p>

      <h2>7. Contact Us</h2>
      <p>
        For data deletion requests or questions about your data, contact us at:
      </p>
      <ul>
        <li>Email: <a href="mailto:privacy@convertraiq.com">privacy@convertraiq.com</a></li>
        <li>Website: <a href="https://www.convertraiq.com">www.convertraiq.com</a></li>
      </ul>
    </LegalPage>
  );
}
