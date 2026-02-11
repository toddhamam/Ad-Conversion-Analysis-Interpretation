import LegalPage from './LegalPage';

export default function CookiePolicy() {
  return (
    <LegalPage
      title="Cookie Policy"
      description="Convertra Cookie Policy — how we use cookies and local storage on our platform."
      canonical="/cookies"
    >
      <p className="legal-effective-date">Effective Date: February 11, 2026</p>

      <p>
        This Cookie Policy explains how Convertra ("we," "our," or "us") uses cookies and similar
        technologies when you use our platform at{' '}
        <a href="https://www.convertraiq.com">www.convertraiq.com</a> (the "Service").
      </p>

      <h2>1. What Are Cookies?</h2>
      <p>
        Cookies are small text files stored on your device by your web browser. They help websites
        remember information about your visit, such as your login status and preferences. Local
        storage is a similar browser-based technology that allows websites to store data locally on
        your device.
      </p>

      <h2>2. How We Use Cookies</h2>

      <h3>2.1 Essential Cookies</h3>
      <p>
        These cookies are necessary for the Service to function and cannot be disabled. They include:
      </p>
      <ul>
        <li>
          <strong>Authentication cookies:</strong> Managed by Supabase to maintain your login session
          and verify your identity across page loads.
        </li>
        <li>
          <strong>CSRF protection cookies:</strong> Used during the Meta OAuth connection flow to
          prevent cross-site request forgery attacks.
        </li>
      </ul>

      <h3>2.2 Functional Storage (localStorage)</h3>
      <p>
        We use your browser's local storage to cache data and improve performance. This includes:
      </p>
      <ul>
        <li>
          <strong>Dashboard preferences:</strong> Your selected date ranges, stat card layout, and ad
          spend configuration.
        </li>
        <li>
          <strong>Channel analysis cache:</strong> Cached ConversionIQ&trade; analysis results to
          avoid redundant API calls.
        </li>
        <li>
          <strong>Image cache:</strong> Top-performing ad images cached for faster loading in the
          creative generation workflow.
        </li>
        <li>
          <strong>Product data:</strong> Product names, descriptions, and mockup images stored
          locally for quick access during ad generation.
        </li>
        <li>
          <strong>Onboarding state:</strong> Whether you have dismissed the onboarding checklist.
        </li>
        <li>
          <strong>Ad publisher presets:</strong> Your saved targeting, budget, and placement
          configurations.
        </li>
      </ul>

      <h3>2.3 Third-Party Cookies</h3>
      <p>
        Some third-party services integrated with our platform may set their own cookies:
      </p>
      <ul>
        <li>
          <strong>Stripe:</strong> Sets cookies during the checkout and billing portal flows to
          process payments securely.
        </li>
        <li>
          <strong>Meta (Facebook):</strong> May set cookies during the OAuth authorization flow when
          you connect your Meta Ads account.
        </li>
      </ul>

      <h2>3. Managing Cookies</h2>
      <p>
        You can control cookies through your browser settings. Most browsers allow you to block or
        delete cookies. However, blocking essential cookies may prevent you from using the Service.
      </p>
      <p>
        To clear local storage data used by Convertra, you can use your browser's developer tools or
        clear all site data for convertraiq.com through your browser settings.
      </p>

      <h2>4. Data Stored Locally</h2>
      <p>
        Data stored in local storage remains on your device until you clear it. We do not transmit
        local storage data to our servers except when you actively use features that require it (such
        as submitting cached product images for AI generation). Local storage data is scoped to your
        browser and is not accessible by other websites.
      </p>

      <h2>5. Changes to This Policy</h2>
      <p>
        We may update this Cookie Policy from time to time to reflect changes in our technology or
        legal requirements. We will post any changes on this page and update the "Effective Date."
      </p>

      <h2>6. Contact Us</h2>
      <p>
        If you have questions about our use of cookies, contact us at:
      </p>
      <ul>
        <li>Email: <a href="mailto:privacy@convertraiq.com">privacy@convertraiq.com</a></li>
        <li>Website: <a href="https://www.convertraiq.com">www.convertraiq.com</a></li>
      </ul>
    </LegalPage>
  );
}
