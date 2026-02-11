import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Player } from '@remotion/player';
import SEO, { organizationSchema, softwareApplicationSchema, faqSchema } from '../components/SEO';
import { ConvertraVSL } from '../remotion/ConvertraVSL';
import { VIDEO_CONFIG } from '../remotion/brand';
import './SalesLanding.css';

// VSL Thumbnail / Poster
const VSLPoster: React.FC<{ width: number; height: number }> = () => {
  return (
    <div className="vsl-poster">
      <div className="vsl-poster-bg" />
      <div className="vsl-poster-orb vsl-poster-orb-1" />
      <div className="vsl-poster-orb vsl-poster-orb-2" />
      <div className="vsl-poster-orb vsl-poster-orb-3" />
      <div className="vsl-poster-content">
        <p className="vsl-poster-eyebrow">Convertra Presents</p>
        <h2 className="vsl-poster-headline">
          Scale <span className="vsl-poster-highlight">Creative Testing</span>.
          <br />
          On <span className="vsl-poster-highlight-alt">Autopilot</span>.
        </h2>
        <p className="vsl-poster-sub">
          See how ConversionIQ™ launches, tests, and scales winning creatives autonomously
        </p>
        <div className="vsl-poster-play">
          <div className="vsl-poster-play-ring" />
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <p className="vsl-poster-play-label">Watch the 90-Second Breakdown</p>
      </div>
    </div>
  );
};

function SalesLanding() {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Smooth scroll behavior for anchor links
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href^="#"]');
      if (anchor) {
        e.preventDefault();
        const id = anchor.getAttribute('href')?.slice(1);
        const element = document.getElementById(id || '');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setIsMobileMenuOpen(false); // Close mobile menu on navigation
        }
      }
    };

    // Scroll detection for nav shadow
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    document.addEventListener('click', handleAnchorClick);
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Scroll-triggered animations
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    document.querySelectorAll('.animate-on-scroll').forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => {
      document.removeEventListener('click', handleAnchorClick);
      window.removeEventListener('scroll', handleScroll);
      observerRef.current?.disconnect();
    };
  }, []);

  const calendarUrl = 'https://lunacal.ai/todd-hamam/convertra-live-demo';

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <div className="sales-landing">
      {/* SEO Meta Tags & Structured Data */}
      <SEO
        title="Winning Ads on Autopilot | Conversion Intelligence Platform"
        description="Convertra's ConversionIQ™ technology autonomously launches, tests, and scales winning ad creatives — at a velocity no human team can match. The #1 autonomous creative intelligence platform for enterprise brands spending $1M+ on paid media."
        keywords="conversion intelligence, AI ad generation, ad creative automation, ConversionIQ, enterprise ad optimization, automated ad testing, CMO ad platform, ROAS optimization, ad creative platform, conversion optimization, Meta ads optimization, Google ads AI"
        canonical="/"
        jsonLd={[organizationSchema, softwareApplicationSchema, faqSchema]}
      />

      {/* Navigation */}
      <nav className={`sales-nav ${isScrolled ? 'scrolled' : ''}`}>
        <div className="nav-container">
          <a href="#hero" className="nav-logo">
            <img src="/convertra-logo.png" alt="Convertra" className="logo-image" />
          </a>

          {/* Desktop Navigation */}
          <div className="nav-links desktop-nav">
            <a href="#mechanism">How It Works</a>
            <a href="#offer">What You Get</a>
            <a href="#pricing">Pricing</a>
            <a href="#credibility">About</a>
          </div>

          <div className="nav-actions">
            <Link to="/login" className="nav-login">Log in</Link>
            <a href={calendarUrl} className="nav-cta">Schedule Demo</a>

            {/* Mobile Menu Button */}
            <button
              className={`mobile-menu-btn ${isMobileMenuOpen ? 'active' : ''}`}
              onClick={toggleMobileMenu}
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
            >
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className={`mobile-nav ${isMobileMenuOpen ? 'open' : ''}`}>
          <a href="#mechanism">How It Works</a>
          <a href="#offer">What You Get</a>
          <a href="#pricing">Pricing</a>
          <a href="#credibility">About</a>
          <Link to="/login" className="mobile-login">Log in</Link>
          <a href={calendarUrl} className="mobile-cta">Schedule Demo</a>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="hero" className="section hero-section">
        <div className="hero-content">
          <h1 className="hero-headline animate-on-scroll">
            <span className="headline-main">Scale Creative Testing. On Autopilot.</span>
            <span className="headline-sub">While Your Competitors Are Still Briefing Designers</span>
          </h1>
          <p className="hero-subhead animate-on-scroll delay-1">
            <span className="highlight">ConversionIQ™</span> autonomously launches, tests, and scales dozens of winning creatives — before your morning standup.
          </p>
          <p className="hero-supporting animate-on-scroll delay-2">
            The autonomous creative intelligence platform for enterprise brands who refuse to stay stuck in the creative bottleneck.
          </p>

          {/* Hero VSL */}
          <div className="hero-demo animate-on-scroll delay-3">
            <div className="demo-container">
              <div className="vsl-player-wrapper">
                <div className="demo-gradient-border"></div>
                <Player
                  component={ConvertraVSL}
                  durationInFrames={VIDEO_CONFIG.durationInFrames}
                  fps={VIDEO_CONFIG.fps}
                  compositionWidth={VIDEO_CONFIG.width}
                  compositionHeight={VIDEO_CONFIG.height}
                  style={{
                    width: '100%',
                    aspectRatio: '16 / 9',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                  controls
                  renderPoster={({ width, height }: { width: number; height: number }) => (
                    <VSLPoster width={width} height={height} />
                  )}
                  posterFillMode="player-size"
                  showPosterWhenUnplayed
                />
              </div>
              <p className="demo-caption">See ConversionIQ™ in action</p>
            </div>
          </div>

          <div className="hero-cta-group animate-on-scroll delay-4">
            <a href={calendarUrl} className="cta-primary">
              Schedule Custom Demo
            </a>
            <p className="cta-subtext">Limited availability. Bespoke implementation only.</p>
          </div>
        </div>

        <div className="hero-visual">
          <div className="visual-orb orb-1"></div>
          <div className="visual-orb orb-2"></div>
          <div className="visual-orb orb-3"></div>
        </div>
      </section>

      {/* Problem Agitation Section */}
      <section id="problem" className="section problem-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            Your Competitors Are Waiting on Designers.<br />
            <span className="header-emphasis">You're Stuck in the <span className="brush-underline">Creative Bottleneck</span></span>
          </h2>

          {/* Visual Demo Placeholder - Dashboard comparison */}
          <div className="visual-placeholder animate-on-scroll delay-1">
            <div className="placeholder-gradient-border"></div>
            <div className="placeholder-inner">
              <div className="comparison-visual">
                <div className="comparison-side">
                  <span className="comparison-label">Human Team</span>
                  <div className="fake-dashboard">
                    <div className="dash-row"></div>
                    <div className="dash-row"></div>
                    <div className="dash-row"></div>
                    <div className="dash-question">1 ad/week</div>
                  </div>
                </div>
                <div className="comparison-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
                <div className="comparison-side highlight-side">
                  <span className="comparison-label">ConversionIQ™</span>
                  <div className="fake-dashboard enhanced">
                    <div className="dash-row"></div>
                    <div className="dash-row"></div>
                    <div className="dash-row"></div>
                    <div className="dash-insight">Dozens/day</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="problem-content animate-on-scroll delay-2">
            <p>
              You've got the media buyers. The designers. The agencies. The creative strategists.
            </p>
            <p>
              And still — launching a single new ad creative takes <em>days</em>.
            </p>
            <p className="problem-callout">
              Brief the team. Wait for design. Review and revise. Finally launch. <strong>One ad.</strong>
            </p>
            <ul className="problem-list">
              <li>Days to produce a single creative variation.</li>
              <li>Weeks to gather enough data to know what works.</li>
              <li>Months to iterate through enough tests to find a winner.</li>
            </ul>
            <p>
              Meanwhile, you're trapped in the same bottleneck as everyone else:
            </p>
            <div className="problem-loop-visual">
              <div className="loop-track">
                <div className="loop-step">
                  <div className="loop-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <span className="loop-text">Brief the team</span>
                </div>
                <div className="loop-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
                <div className="loop-step">
                  <div className="loop-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                  <span className="loop-text">Wait for design</span>
                </div>
                <div className="loop-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
                <div className="loop-step">
                  <div className="loop-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M9 9c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.3-.84 2.4-2 2.82V14"/>
                      <circle cx="12" cy="17" r="1" fill="currentColor"/>
                    </svg>
                  </div>
                  <span className="loop-text">Review & revise</span>
                </div>
                <div className="loop-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
                <div className="loop-step">
                  <div className="loop-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10"/>
                      <polyline points="1 20 1 14 7 14"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                  </div>
                  <span className="loop-text">Finally launch</span>
                </div>
                <div className="loop-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
                <div className="loop-step">
                  <div className="loop-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v6"/>
                      <path d="M12 22v-6"/>
                      <circle cx="12" cy="12" r="4"/>
                      <path d="M8 12H2"/>
                      <path d="M22 12h-6"/>
                      <path d="M6 6l3 3"/>
                      <path d="M15 15l3 3"/>
                      <path d="M6 18l3-3"/>
                      <path d="M15 9l3-3"/>
                    </svg>
                  </div>
                  <span className="loop-text">One ad. Repeat.</span>
                </div>
                <div className="loop-arrow loop-back">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M17 1l4 4-4 4"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <path d="M7 23l-4-4 4-4"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                  </svg>
                </div>
              </div>
              <div className="loop-label">The Creative Bottleneck</div>
            </div>
            <div className="problem-pain">
              <p>Every day stuck in this cycle is a day your competitors could be pulling ahead.</p>
              <p>Every creative that takes a week to produce is dozens of tests you never ran.</p>
              <p className="pain-emphasis">And the worst part?</p>
              <p><strong>The bottleneck isn't talent. It's velocity. And it's costing you everything.</strong></p>
            </div>
          </div>
        </div>
      </section>

      {/* Mechanism Reveal Section */}
      <section id="mechanism" className="section mechanism-section">
        <div className="section-container">
          <h2 className="section-header mechanism-header animate-on-scroll">
            <span className="mechanism-title">Introducing <span className="highlight">ConversionIQ™</span></span>
            <span className="mechanism-subtitle">The Autonomous Creative Engine That Never Sleeps</span>
          </h2>
          <p className="mechanism-intro animate-on-scroll delay-1">
            ConversionIQ™ is our autonomous agentic technology that does what human teams can't.<br />
            <strong>It launches, tests, and scales winning creatives — at a velocity no team can match.</strong>
          </p>

          {/* Animated Workflow Visualization */}
          <div className="workflow-visual animate-on-scroll delay-2">
            <div className="workflow-container">
              <div className="workflow-step active" data-step="1">
                <div className="workflow-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <span className="workflow-label">Extract</span>
              </div>
              <div className="workflow-connector">
                <div className="connector-line"></div>
                <div className="connector-pulse"></div>
              </div>
              <div className="workflow-step" data-step="2">
                <div className="workflow-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 16v-4"/>
                    <path d="M12 8h.01"/>
                  </svg>
                </div>
                <span className="workflow-label">Interpret</span>
              </div>
              <div className="workflow-connector">
                <div className="connector-line"></div>
                <div className="connector-pulse"></div>
              </div>
              <div className="workflow-step" data-step="3">
                <div className="workflow-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <span className="workflow-label">Generate</span>
              </div>
              <div className="workflow-connector">
                <div className="connector-line"></div>
                <div className="connector-pulse"></div>
              </div>
              <div className="workflow-step" data-step="4">
                <div className="workflow-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 1l4 4-4 4"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <path d="M7 23l-4-4 4-4"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                  </svg>
                </div>
                <span className="workflow-label">Repeat</span>
              </div>
            </div>
          </div>

          <p className="mechanism-lead animate-on-scroll delay-3">Here's how it works:</p>

          <div className="mechanism-steps">
            <div className="mechanism-step animate-on-scroll delay-1">
              <div className="step-number">01</div>
              <div className="step-content">
                <h3 className="step-title">Extract</h3>
                <p className="step-description">
                  ConversionIQ™ continuously ingests every data point across your ad channels—Meta, Google,
                  TikTok, programmatic—building a real-time intelligence layer that powers autonomous creative decisions at scale.
                </p>
                <p className="step-benefit">No more waiting for reports. The system is always learning.</p>
              </div>
              {/* Step Visual Placeholder */}
              <div className="step-visual">
                <div className="visual-placeholder-small">
                  <div className="platform-icons">
                    <span className="platform-dot"></span>
                    <span className="platform-dot"></span>
                    <span className="platform-dot"></span>
                    <span className="platform-dot"></span>
                  </div>
                  <div className="unify-arrow"></div>
                  <div className="unified-icon"></div>
                </div>
              </div>
            </div>

            <div className="mechanism-step animate-on-scroll delay-2">
              <div className="step-number">02</div>
              <div className="step-content">
                <h3 className="step-title">Interpret</h3>
                <p className="step-lead">This is where the intelligence lives.</p>
                <p className="step-description">
                  ConversionIQ™ performs deep pattern analysis on every conversion — identifying the exact
                  creative elements, copy structures, and audience signals that drive action.
                </p>
                <p className="step-description">
                  It maps the conversion DNA across your entire ad ecosystem —
                  what triggers purchases, what accelerates decisions, what compounds performance.
                </p>
                <p className="step-benefit">
                  Insights no human team could extract at this speed.<br />
                  Connections that power autonomous creative decisions.
                </p>
              </div>
              {/* Step Visual Placeholder */}
              <div className="step-visual">
                <div className="visual-placeholder-small">
                  <div className="insight-bubbles">
                    <span className="bubble"></span>
                    <span className="bubble"></span>
                    <span className="bubble"></span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mechanism-step animate-on-scroll delay-3">
              <div className="step-number">03</div>
              <div className="step-content">
                <h3 className="step-title">Generate</h3>
                <p className="step-lead">Here's where velocity becomes real.</p>
                <p className="step-description">
                  ConversionIQ™ autonomously engineers new ad creatives—copy, visuals, and targeting—from
                  proven conversion patterns. Not templates. Not best guesses. Real intelligence, at scale.
                </p>
                <ul className="step-list">
                  <li>Dozens of creatives generated autonomously.</li>
                  <li>Every variation built from your proven conversion patterns.</li>
                  <li><strong>Launched, tested, and scaled — without waiting on a single human.</strong></li>
                </ul>
              </div>
              {/* Step Visual Placeholder */}
              <div className="step-visual">
                <div className="visual-placeholder-small">
                  <div className="ad-cards-preview">
                    <div className="mini-ad-card"></div>
                    <div className="mini-ad-card"></div>
                    <div className="mini-ad-card"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mechanism-step animate-on-scroll delay-4">
              <div className="step-number">04</div>
              <div className="step-content">
                <h3 className="step-title">Repeat</h3>
                <p className="step-lead">The system compounds.</p>
                <p className="step-description">
                  Every creative tested makes the next one smarter. Every conversion accelerates the flywheel.
                </p>
                <p className="step-description">
                  It's not a one-time optimization. <strong>It's a compounding velocity advantage.</strong>
                </p>
                <p className="step-benefit">
                  Your creative velocity accelerates — while your competitors stay stuck in the bottleneck.
                </p>
              </div>
              {/* Step Visual Placeholder */}
              <div className="step-visual">
                <div className="visual-placeholder-small">
                  <div className="growth-chart">
                    <div className="chart-bar" style={{ height: '30%' }}></div>
                    <div className="chart-bar" style={{ height: '50%' }}></div>
                    <div className="chart-bar" style={{ height: '70%' }}></div>
                    <div className="chart-bar" style={{ height: '90%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bespoke Differentiator Section */}
      <section id="bespoke" className="section bespoke-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            This Isn't Software You Figure Out.<br />
            <span className="header-emphasis">It's an Automated Partnership.</span>
          </h2>

          <div className="bespoke-intro animate-on-scroll delay-1">
            <p>Let's be clear about what Convertra is <em>not</em>.</p>
            <ul className="not-list">
              <li>It's not a self-serve tool you log into and figure out yourself.</li>
              <li>It's not another AI widget that generates generic content.</li>
              <li>It's not another platform for your team to learn, manage, and troubleshoot.</li>
            </ul>
            <p className="bespoke-statement">
              <strong>Convertra is a fully autonomous creative intelligence system—built around your business and managed end-to-end.</strong>
            </p>
          </div>

          <p className="bespoke-lead animate-on-scroll delay-2">Here's what that means:</p>

          <div className="bespoke-features">
            <div className="bespoke-feature gradient-border-card animate-on-scroll delay-1">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <h3>Bespoke Implementation</h3>
                <p>
                  Before we generate a single ad, our team studies your business. Your channels.
                  Your customers. Your conversion history.
                </p>
                <p>
                  We configure ConversionIQ™ to <em>your</em> patterns—not industry benchmarks.
                  Not generic templates.
                </p>
                <p className="feature-emphasis">
                  No two implementations are the same.<br />Because no two businesses are.
                </p>
                {/* Feature Visual */}
                <div className="feature-visual">
                  <div className="config-animation">
                    <div className="config-dot"></div>
                    <div className="config-dot"></div>
                    <div className="config-dot"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bespoke-feature gradient-border-card animate-on-scroll delay-2">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <h3>White Glove Management</h3>
                <p>You don't manage the system. We do.</p>
                <p>
                  Our team monitors performance. Interprets the data. Optimizes the output.
                  Evolves the model as your market changes.
                </p>
                <p className="feature-emphasis">You get the results without the overhead.</p>
                {/* Feature Visual */}
                <div className="feature-visual">
                  <div className="team-avatars">
                    <div className="avatar"></div>
                    <div className="avatar"></div>
                    <div className="avatar"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bespoke-feature gradient-border-card animate-on-scroll delay-3">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <h3>Dedicated Partnership</h3>
                <p>This isn't a vendor relationship. It's a partnership.</p>
                <p>
                  You'll have a dedicated team who knows your business, understands your goals,
                  and is accountable to your outcomes.
                </p>
                <p className="feature-emphasis">
                  Not a chatbot. Not a help desk.<br />
                  Real people who are invested in your success.
                </p>
                {/* Feature Visual */}
                <div className="feature-visual">
                  <div className="handshake-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Outcome Section */}
      <section id="outcome" className="section outcome-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            The Result: Creative Velocity on Autopilot—<br />
            <span className="header-emphasis">That Compounds Every Week</span>
          </h2>

          <p className="outcome-intro animate-on-scroll delay-1">
            When you work with Convertra, you're not <em>waiting</em> on designers or hoping your next ad works.<br />
            You're deploying dozens of creatives <strong>engineered from proven conversion patterns</strong>—autonomously, at scale.
          </p>

          {/* Results Demo Placeholder */}
          <div className="results-visual animate-on-scroll delay-2">
            <div className="results-placeholder">
              <div className="placeholder-gradient-border"></div>
              <div className="placeholder-inner">
                <div className="metrics-showcase">
                  <div className="metric-card">
                    <span className="metric-value animate-count">47%</span>
                    <span className="metric-label">Reduced CPA</span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-value animate-count">3.2x</span>
                    <span className="metric-label">ROAS Improvement</span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-value animate-count">80%</span>
                    <span className="metric-label">Less Creative Waste</span>
                  </div>
                </div>
                <p className="metrics-caption">Example results from enterprise clients</p>
              </div>
            </div>
          </div>

          <p className="outcome-lead animate-on-scroll delay-3">Here's what that looks like in practice:</p>

          <div className="outcome-benefits">
            <div className="outcome-benefit animate-on-scroll delay-1">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <h3>Eliminate the creative bottleneck.</h3>
              <p>
                No more waiting days for a single ad. ConversionIQ™ autonomously generates,
                launches, and tests dozens of creatives — while your team focuses on strategy.
              </p>
            </div>

            <div className="outcome-benefit animate-on-scroll delay-2">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                </svg>
              </div>
              <h3>Scale without scaling headcount.</h3>
              <p>
                Replace the bloated creative team with an autonomous system that produces
                more variations — informed by real conversion data — than any team could.
              </p>
            </div>

            <div className="outcome-benefit animate-on-scroll delay-3">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 6l-9.5 9.5-5-5L1 18"/>
                  <path d="M17 6h6v6"/>
                </svg>
              </div>
              <h3>Compound your creative advantage.</h3>
              <p>
                Every creative tested makes the next one smarter. Your velocity doesn't plateau—it accelerates.
              </p>
            </div>

            <div className="outcome-benefit animate-on-scroll delay-4">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <h3>Cut hundreds of thousands in overhead.</h3>
              <p>
                Replace the need for additional designers, media buyers, and creative strategists
                with an autonomous system that outperforms them—faster, smarter, and without the bottleneck.
              </p>
            </div>

            <div className="outcome-benefit animate-on-scroll delay-5">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <path d="M22 4L12 14.01l-3-3"/>
                </svg>
              </div>
              <h3>Focus on running your business.</h3>
              <p>We manage the system. You review the results. That's it.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility/Proof Section */}
      <section id="credibility" className="section credibility-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            Built for Enterprise Brands<br />
            <span className="header-emphasis">With Serious Ad Spend</span>
          </h2>

          <div className="credibility-content animate-on-scroll delay-1">
            <p className="credibility-statement">
              Convertra isn't for everyone.
            </p>
            <p>
              We work with established companies spending <strong>six to eight figures annually</strong> on
              paid media—brands who understand that a 10% efficiency gain isn't a "nice to have."
            </p>
            <p className="credibility-emphasis">It's millions in recovered revenue.</p>

            <p className="credibility-lead">Our clients come to us because they've hit the ceiling with the alternatives:</p>
            <ul className="alternatives-list">
              <li>Agencies that bill hours but can't move fast enough.</li>
              <li>AI tools that generate volume but not intelligence.</li>
              <li>In-house teams stretched too thin to test at the velocity the market demands.</li>
            </ul>
            <p className="credibility-close">
              They come to Convertra because they're <strong>done being bottlenecked</strong>.
            </p>
          </div>

          {/* Logo Carousel Placeholder */}
          <div className="logo-carousel animate-on-scroll delay-2">
            <div className="carousel-track">
              <div className="logo-placeholder"></div>
              <div className="logo-placeholder"></div>
              <div className="logo-placeholder"></div>
              <div className="logo-placeholder"></div>
              <div className="logo-placeholder"></div>
              <div className="logo-placeholder"></div>
              {/* Duplicate for seamless loop */}
              <div className="logo-placeholder"></div>
              <div className="logo-placeholder"></div>
              <div className="logo-placeholder"></div>
              <div className="logo-placeholder"></div>
              <div className="logo-placeholder"></div>
              <div className="logo-placeholder"></div>
            </div>
          </div>

          {/* Testimonial Placeholder */}
          <div className="testimonial-placeholder animate-on-scroll delay-3">
            <div className="testimonial-card gradient-border-card">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="quote-mark">"</div>
                <p className="testimonial-text">
                  Testimonial quote will go here. This is placeholder text for a client success story.
                </p>
                <div className="testimonial-author">
                  <div className="author-avatar"></div>
                  <div className="author-info">
                    <span className="author-name">Client Name</span>
                    <span className="author-title">Title, Company</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Offer Section */}
      <section id="offer" className="section offer-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">What You Get</h2>
          <p className="offer-intro animate-on-scroll delay-1">When you partner with Convertra, you receive:</p>

          <div className="offer-grid">
            <div className="offer-item gradient-border-card animate-on-scroll delay-1">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="offer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <h3>ConversionIQ™ Technology</h3>
                <p>Our autonomous agentic engine that launches, tests, and scales winning creatives — configured to your business.</p>
              </div>
            </div>

            <div className="offer-item gradient-border-card animate-on-scroll delay-2">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="offer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                </div>
                <h3>Bespoke Implementation</h3>
                <p>A fully custom setup built around your channels, audiences, and conversion goals.</p>
              </div>
            </div>

            <div className="offer-item gradient-border-card animate-on-scroll delay-3">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="offer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                </div>
                <h3>Ongoing Management</h3>
                <p>Continuous monitoring, optimization, and evolution by our dedicated team.</p>
              </div>
            </div>

            <div className="offer-item gradient-border-card animate-on-scroll delay-4">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="offer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                </div>
                <h3>Autonomous Creative Velocity</h3>
                <p>Dozens of creatives generated, launched, and scaled autonomously from your proven conversion patterns.</p>
              </div>
            </div>

            <div className="offer-item gradient-border-card animate-on-scroll delay-5">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="offer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
                    <path d="M22 12A10 10 0 0 0 12 2v10z"/>
                  </svg>
                </div>
                <h3>Performance Reporting</h3>
                <p>Clear, actionable insights — not vanity metrics. Real-time visibility into what's converting and what's scaling.</p>
              </div>
            </div>

            <div className="offer-item gradient-border-card animate-on-scroll delay-6">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="offer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <h3>Dedicated Partnership</h3>
                <p>A team that knows your business and is accountable to your outcomes.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="section pricing-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            Two Ways to Partner<br />
            <span className="header-emphasis">With Convertra</span>
          </h2>
          <p className="pricing-intro animate-on-scroll delay-1">
            Every engagement starts with white-glove implementation.<br />
            <strong>Choose how you want to run it from there.</strong>
          </p>

          <div className="pricing-cards-grid">
            {/* Enterprise Self-Service */}
            <div className="pricing-card gradient-border-card animate-on-scroll delay-2">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="pricing-badge">Enterprise</div>
                <h3 className="pricing-title">Self-Service</h3>
                <p className="pricing-tagline">We set it up. Your team runs it.</p>

                <div className="pricing-price-block">
                  <div className="pricing-price-custom">Custom Pricing</div>
                  <div className="pricing-setup-fee">Schedule a demo to learn more</div>
                </div>

                <p className="pricing-description">
                  We install and configure your Convertra platform, then hand the keys to your internal team. A dedicated point of contact from our team is always available to assist.
                </p>

                <ul className="pricing-checklist">
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Full platform installation &amp; configuration
                  </li>
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Dedicated Convertra point of contact
                  </li>
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Your team member drives day-to-day
                  </li>
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Unlimited creatives &amp; analyses
                  </li>
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Custom branding &amp; API access
                  </li>
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Priority support
                  </li>
                </ul>

                <div className="pricing-cta">
                  <a href={calendarUrl} className="cta-primary cta-large">
                    Schedule a Demo
                  </a>
                </div>
              </div>
            </div>

            {/* Velocity Partner */}
            <div className="pricing-card pricing-card-featured gradient-border-card animate-on-scroll delay-3">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="pricing-badge pricing-badge-featured">Velocity Partner</div>
                <h3 className="pricing-title">Full Partnership</h3>
                <p className="pricing-tagline">We set it up. We run it for you.</p>

                <div className="pricing-price-block">
                  <div className="pricing-price-custom">Custom Pricing</div>
                  <div className="pricing-setup-fee">Schedule a demo to learn more</div>
                </div>

                <p className="pricing-description">
                  Everything in Enterprise, plus a dedicated Convertra media buyer who runs your entire creative testing operation. Set your weekly quota — we handle the rest.
                </p>

                <ul className="pricing-checklist">
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Everything in Enterprise, plus:
                  </li>
                  <li className="pricing-checklist-highlight">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Dedicated Convertra media buyer
                  </li>
                  <li className="pricing-checklist-highlight">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Weekly creative output quota
                  </li>
                  <li className="pricing-checklist-highlight">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Ad launching, testing &amp; optimization
                  </li>
                  <li className="pricing-checklist-highlight">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Ongoing creative refinement
                  </li>
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    More creative output, better results
                  </li>
                </ul>

                <div className="pricing-cta">
                  <a href={calendarUrl} className="cta-primary cta-large">
                    Schedule a Demo
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="pricing-why animate-on-scroll delay-4">
            <p className="pricing-why-title">Why enterprise only — for now?</p>
            <p className="pricing-why-text">
              Because every implementation is fully custom and bespoke. We study your business,
              configure the system to your patterns, and manage it end-to-end. This level of
              white-glove service requires dedicated attention and expertise that doesn't scale
              with self-serve signups — at least not yet.
            </p>
          </div>
        </div>
      </section>

      {/* Risk Reversal / Urgency Section */}
      <section id="urgency" className="section urgency-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">The Cost of Waiting</h2>
          <p className="urgency-subtitle animate-on-scroll delay-1">
            Every month without ConversionIQ™, the creative bottleneck is costing you across three areas most teams never audit.
          </p>

          <div className="cost-cards animate-on-scroll delay-2">
            <div className="cost-card">
              <div className="cost-card-amount">$80–100K<span className="cost-card-period">/year</span></div>
              <h3 className="cost-card-title">Bloated Creative Teams</h3>
              <p className="cost-card-desc">
                Designers, media buyers, and creative strategists commanding $8–12K/month each — and still only producing a handful of creatives per week. ConversionIQ™ replaces the bottleneck with autonomous velocity.
              </p>
            </div>

            <div className="cost-card">
              <div className="cost-card-amount">$100K+<span className="cost-card-period">/year</span></div>
              <h3 className="cost-card-title">Slow Creative Testing</h3>
              <p className="cost-card-desc">
                60–70% of ad spend wasted on creatives that never convert — because your team can only test a few variations per week. ConversionIQ™ tests dozens autonomously, finding winners at a velocity humans can't match.
              </p>
            </div>

            <div className="cost-card">
              <div className="cost-card-amount">$50–75K<span className="cost-card-period">/year</span></div>
              <h3 className="cost-card-title">Creative Fatigue & Decay</h3>
              <p className="cost-card-desc">
                Winning ads have a shelf life. Most teams don't catch the decay until CPA has already spiked 30–50%. ConversionIQ™ autonomously detects fatigue and generates proven replacements before performance drops.
              </p>
            </div>
          </div>

          <div className="cost-total animate-on-scroll delay-3">
            <div className="cost-total-inner">
              <p className="cost-total-label">Total hidden cost of the status quo</p>
              <p className="cost-total-amount">$230–275K <span className="cost-total-period">per year</span></p>
              <p className="cost-total-note">And that's before counting the revenue you're leaving on the table from underperforming creatives.</p>
            </div>
          </div>

          <div className="urgency-close-wrapper animate-on-scroll delay-3">
            <p className="urgency-scarcity">
              Because every implementation is bespoke—built and managed by our team—we
              only take on a <strong>limited number of clients</strong> at any time.
            </p>
            <div className="urgency-visual">
              <div className="countdown-placeholder">
                <span className="spots-label">Limited spots available</span>
                <div className="spots-indicator">
                  <span className="spot filled"></span>
                  <span className="spot filled"></span>
                  <span className="spot filled"></span>
                  <span className="spot"></span>
                  <span className="spot"></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section id="contact" className="section cta-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            Ready to Break Free From the Creative Bottleneck?
          </h2>

          <div className="cta-content animate-on-scroll delay-1">
            <p className="cta-intro">Request a custom assessment and we'll show you:</p>
            <ul className="cta-list">
              <li>How many creatives ConversionIQ™ could be testing for you — autonomously.</li>
              <li>The conversion patterns hiding in your current ad data.</li>
              <li>How a bespoke autonomous implementation would work for your business.</li>
            </ul>
            <p className="cta-reassurance">
              No obligation. No generic pitch deck.<br />
              Just a conversation about what autonomous creative velocity looks like for your business.
            </p>
            <div className="cta-final">
              <a href={calendarUrl} className="cta-primary cta-large pulse-glow">
                Schedule Custom Demo
              </a>
              <p className="cta-subtext">Limited availability. Enterprise clients only.</p>
              <p className="cta-subtext" style={{ marginTop: '12px' }}>
                Or email us directly at{' '}
                <a href="mailto:hello@convertraiq.com" style={{ color: 'var(--accent-violet)', fontWeight: 600, textDecoration: 'none' }}>
                  hello@convertraiq.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="sales-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <span className="footer-logo">Convertra</span>
            <p className="footer-tagline">
              Scale creative testing on autopilot. That's ConversionIQ™.
            </p>
          </div>
          <div className="footer-links">
            <a href="#hero">Home</a>
            <a href="#mechanism">How It Works</a>
            <a href="#offer">What You Get</a>
            <a href="#pricing">Pricing</a>
            <a href={calendarUrl}>Contact</a>
          </div>
          <div className="footer-legal">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
            <a href="/cookies">Cookie Policy</a>
            <a href="/data-deletion">Data Deletion</a>
          </div>
          <p className="footer-copyright">
            &copy; {new Date().getFullYear()} Convertra. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default SalesLanding;
