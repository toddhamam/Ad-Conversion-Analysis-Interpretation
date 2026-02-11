import LegalPage from './LegalPage';

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="Convertra Privacy Policy — how we collect, use, and protect your data."
      canonical="/privacy"
    >
      <p className="legal-effective-date">Effective Date: February 11, 2026</p>

      <p>
        Convertra ("we," "our," or "us") operates the Convertra platform at{' '}
        <a href="https://www.convertraiq.com">www.convertraiq.com</a> (the "Service"). This Privacy
        Policy explains how we collect, use, disclose, and safeguard your information when you use
        our Service.
      </p>

      <h2>1. Information We Collect</h2>

      <h3>1.1 Account Information</h3>
      <p>
        When you create an account, we collect your name, email address, company name, and password.
        Authentication is managed through Supabase, a third-party authentication provider.
      </p>

      <h3>1.2 Advertising Platform Data</h3>
      <p>
        When you connect your Meta (Facebook/Instagram) advertising account, we access your ad
        campaign data including: campaign names, ad creative content (headlines, body text, images),
        performance metrics (spend, impressions, clicks, conversions, ROAS, CTR, CPA), audience
        targeting settings, and ad account configuration. This data is accessed through the Meta
        Marketing API with your explicit authorization.
      </p>

      <h3>1.3 Billing Information</h3>
      <p>
        Payment processing is handled by Stripe. We do not store your credit card numbers or bank
        account details on our servers. Stripe may collect payment method details, billing address,
        and transaction history in accordance with their own privacy policy.
      </p>

      <h3>1.4 AI-Generated Content</h3>
      <p>
        When you use our CreativeIQ&trade; ad generation features, we process your campaign data and
        product information through AI services (OpenAI and Google Gemini) to generate ad copy and
        creative assets. The prompts and generated outputs are not retained by these AI providers
        beyond the processing session.
      </p>

      <h3>1.5 Product Information</h3>
      <p>
        If you add products to the platform, we collect product names, descriptions, author/brand
        names, landing page URLs, and product mockup images you upload.
      </p>

      <h3>1.6 Usage Data</h3>
      <p>
        We automatically collect information about how you interact with the Service, including pages
        visited, features used, browser type, device information, and IP address.
      </p>

      <h3>1.7 Cookies and Local Storage</h3>
      <p>
        We use cookies for authentication sessions and local storage for caching preferences and
        performance data. See our <a href="/cookies">Cookie Policy</a> for details.
      </p>

      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide, maintain, and improve the Service</li>
        <li>Analyze your ad campaign performance and generate conversion insights</li>
        <li>Generate AI-powered ad creative recommendations and assets</li>
        <li>Process billing and manage your subscription</li>
        <li>Send transactional emails (account verification, password resets, billing receipts)</li>
        <li>Provide customer support</li>
        <li>Detect and prevent fraud or abuse</li>
        <li>Comply with legal obligations</li>
      </ul>

      <h2>3. How We Share Your Information</h2>
      <p>We do not sell your personal information. We share data only with:</p>
      <ul>
        <li>
          <strong>Service Providers:</strong> Supabase (authentication and database), Stripe (payment
          processing), OpenAI and Google (AI processing), Vercel (hosting), and Meta (advertising API
          access) — each solely to provide their respective services.
        </li>
        <li>
          <strong>At Your Direction:</strong> When you publish ads through our platform, we submit
          your ad creative and campaign configuration to Meta on your behalf.
        </li>
        <li>
          <strong>Legal Requirements:</strong> If required by law, subpoena, or other legal process,
          or to protect our rights, property, or safety.
        </li>
        <li>
          <strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of
          assets, your information may be transferred as part of that transaction.
        </li>
      </ul>

      <h2>4. Data Security</h2>
      <p>
        We implement industry-standard security measures to protect your data. Meta API access tokens
        are encrypted at rest using AES-256-GCM encryption. All data in transit uses TLS/HTTPS
        encryption. Access tokens are never exposed to the browser — all Meta API calls are proxied
        through our secure backend.
      </p>

      <h2>5. Data Retention</h2>
      <p>
        We retain your account data for as long as your account is active. Campaign performance data
        accessed from Meta is cached temporarily for display purposes and is not permanently stored
        on our servers. If you delete your account, we will delete your personal data within 30 days,
        except where retention is required by law.
      </p>

      <h2>6. Your Rights</h2>
      <p>Depending on your jurisdiction, you may have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you</li>
        <li>Correct inaccurate data</li>
        <li>Request deletion of your data (see our <a href="/data-deletion">Data Deletion</a> page)</li>
        <li>Object to or restrict certain processing</li>
        <li>Data portability</li>
        <li>Withdraw consent at any time</li>
      </ul>
      <p>
        To exercise these rights, contact us at{' '}
        <a href="mailto:privacy@convertraiq.com">privacy@convertraiq.com</a>.
      </p>

      <h2>7. Meta Platform Data</h2>
      <p>
        Our use of data received from Meta APIs complies with the{' '}
        <a href="https://developers.facebook.com/policy/" target="_blank" rel="noopener noreferrer">
          Meta Platform Terms
        </a>{' '}
        and{' '}
        <a href="https://developers.facebook.com/devpolicy/" target="_blank" rel="noopener noreferrer">
          Developer Policies
        </a>
        . We only access the data necessary to provide our Service, and we do not use Meta data for
        purposes unrelated to the Service. You can revoke our access to your Meta data at any time
        through your{' '}
        <a href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noopener noreferrer">
          Facebook Business Integrations settings
        </a>.
      </p>

      <h2>8. International Data Transfers</h2>
      <p>
        Your data may be processed in the United States and other countries where our service
        providers operate. We ensure appropriate safeguards are in place for international transfers
        of personal data.
      </p>

      <h2>9. Children's Privacy</h2>
      <p>
        Our Service is not intended for individuals under 18 years of age. We do not knowingly
        collect personal information from children.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of material changes
        by posting the new policy on this page and updating the "Effective Date" above. Your
        continued use of the Service after changes constitutes acceptance of the updated policy.
      </p>

      <h2>11. Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy, contact us at:
      </p>
      <ul>
        <li>Email: <a href="mailto:privacy@convertraiq.com">privacy@convertraiq.com</a></li>
        <li>Website: <a href="https://www.convertraiq.com">www.convertraiq.com</a></li>
      </ul>
    </LegalPage>
  );
}
