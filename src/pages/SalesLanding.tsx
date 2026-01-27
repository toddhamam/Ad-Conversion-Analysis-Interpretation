import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './SalesLanding.css';

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

  const calendarUrl = '#contact'; // Placeholder - will be replaced with LunchCal URL

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <div className="sales-landing">
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
            <span className="headline-main">Winning Ads on Autopilot</span>
            <span className="headline-sub">Without the Wasted Spend or the Bloated Team</span>
          </h1>
          <p className="hero-subhead animate-on-scroll delay-1">
            Our <span className="highlight">ConversionIQ™</span> technology extracts the full conversion story from your data... Then uses it to generate winning ads - on autopilot.
          </p>
          <p className="hero-supporting animate-on-scroll delay-2">
            The #1 conversion intelligence & creative platform for enterprise brands who refuse to waste ad any more spend.
          </p>
          {/* Hero Demo Placeholder */}
          <div className="hero-demo animate-on-scroll delay-3">
            <div className="demo-container">
              <div className="demo-placeholder">
                <div className="demo-gradient-border"></div>
                <div className="demo-inner">
                  {/* Placeholder for video/animation */}
                  <div className="demo-preview">
                    <div className="demo-screen">
                      <div className="screen-header">
                        <span className="screen-dot"></span>
                        <span className="screen-dot"></span>
                        <span className="screen-dot"></span>
                      </div>
                      <div className="screen-content">
                        <div className="screen-chart"></div>
                        <div className="screen-metrics">
                          <div className="metric-bar"></div>
                          <div className="metric-bar"></div>
                          <div className="metric-bar"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button className="play-button" aria-label="Play demo video">
                    <span className="play-pulse"></span>
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </button>
                </div>
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
            You're Spending Millions on Ads.<br />
            <span className="header-emphasis">But Do You Actually Know <span className="brush-underline">Why</span> Your Best Ads Convert?</span>
          </h2>

          {/* Visual Demo Placeholder - Dashboard comparison */}
          <div className="visual-placeholder animate-on-scroll delay-1">
            <div className="placeholder-gradient-border"></div>
            <div className="placeholder-inner">
              <div className="comparison-visual">
                <div className="comparison-side">
                  <span className="comparison-label">Standard Dashboard</span>
                  <div className="fake-dashboard">
                    <div className="dash-row"></div>
                    <div className="dash-row"></div>
                    <div className="dash-row"></div>
                    <div className="dash-question">?</div>
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
                    <div className="dash-insight">WHY</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="problem-content animate-on-scroll delay-2">
            <p>
              You've got the dashboards. The reports. The analysts. The agencies.
            </p>
            <p>
              You can see <em>what's</em> happening—impressions, clicks, ROAS, conversions.
            </p>
            <p className="problem-callout">
              But here's what none of them tell you: <strong>Why.</strong>
            </p>
            <ul className="problem-list">
              <li>Why did that ad outperform the others?</li>
              <li>Why did conversions spike last Tuesday?</li>
              <li>Why does one audience convert at 4x the rate of another?</li>
            </ul>
            <p>
              Without the why, you're trapped in an endless loop:
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
                  <span className="loop-text">Launch creative</span>
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
                  <span className="loop-text">Wait for data</span>
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
                  <span className="loop-text">Guess what worked</span>
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
                  <span className="loop-text">Test again</span>
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
                  <span className="loop-text">Burn more budget</span>
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
              <div className="loop-label">The Endless Wastage Cycle $$$</div>
            </div>
            <div className="problem-pain">
              <p>Every failed test costs you money.</p>
              <p>Every week spent "optimizing" is a week your competitors are pulling ahead.</p>
              <p className="pain-emphasis">And the worst part?</p>
              <p><strong>The answers are already in your data. You just can't see them.</strong></p>
            </div>
          </div>
        </div>
      </section>

      {/* Mechanism Reveal Section */}
      <section id="mechanism" className="section mechanism-section">
        <div className="section-container">
          <h2 className="section-header mechanism-header animate-on-scroll">
            <span className="mechanism-title">Introducing <span className="highlight">ConversionIQ™</span></span>
            <span className="mechanism-subtitle">The Intelligence Layer Your Ad Stack Is Missing</span>
          </h2>
          <p className="mechanism-intro animate-on-scroll delay-1">
            ConversionIQ™ is our proprietary technology that does what dashboards can't.<br />
            <strong>It doesn't just show you data. It interprets it... And Then Generates.</strong>
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
                  ConversionIQ™ pulls your ad performance data from every platform—Meta, Google,
                  TikTok, programmatic, all of it—and unifies it into a single intelligence layer.
                </p>
                <p className="step-benefit">No more siloed reports. No more fragmented insights.</p>
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
                <p className="step-lead">This is where everything changes.</p>
                <p className="step-description">
                  ConversionIQ™ analyzes the patterns underneath your data—the signals that reveal
                  <em> why</em> people convert. Not just what happened. <strong>Why it happened.</strong>
                </p>
                <p className="step-description">
                  What's resonating with your audience. What triggers purchases. What elements
                  drive action—across creative, copy, audience, and timing.
                </p>
                <p className="step-benefit">
                  Insights you'd never find in a standard dashboard.<br />
                  Connections no analyst would catch.
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
                <p className="step-lead">Here's where the intelligence becomes income.</p>
                <p className="step-description">
                  ConversionIQ™ takes what it's learned and automatically generates new creative—ads
                  engineered from your proven conversion patterns.
                </p>
                <ul className="step-list">
                  <li>Not templates.</li>
                  <li>Not "best practices" borrowed from other industries.</li>
                  <li><strong>Ads built from your data. Your customers. Your conversion truth.</strong></li>
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
                <p className="step-lead">The system learns.</p>
                <p className="step-description">
                  Every conversion feeds the model. Every ad makes the next one smarter.
                </p>
                <p className="step-description">
                  It's not a one-time insight. <strong>It's a compounding advantage.</strong>
                </p>
                <p className="step-benefit">
                  Your ads get better—automatically—while your competitors keep guessing.
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
            This Isn't Software.<br />
            <span className="header-emphasis">It's a System Built Around Your Company.</span>
          </h2>

          <div className="bespoke-intro animate-on-scroll delay-1">
            <p>Let's be clear about what Convertra is <em>not</em>.</p>
            <ul className="not-list">
              <li>It's not a self-serve platform you log into and figure out yourself.</li>
              <li>It's not a generic dashboard with AI buzzwords slapped on top.</li>
              <li>It's not another tool for your team to learn, manage, and troubleshoot.</li>
            </ul>
            <p className="bespoke-statement">
              <strong>Convertra is a fully managed conversion intelligence system—built around your business.</strong>
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
            The Result: Ads That Convert From Day One—<br />
            <span className="header-emphasis">And Get Smarter Every Week</span>
          </h2>

          <p className="outcome-intro animate-on-scroll delay-1">
            When you work with Convertra, you're not <em>hoping</em> your next ad works.<br />
            You're deploying creative that's <strong>engineered to convert</strong>—because
            it's built from what's already proven.
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
              <h3>Eliminate the testing lag.</h3>
              <p>
                No more months of A/B tests burning budget. Your first ads are built on
                conversion truth, not guesses.
              </p>
            </div>

            <div className="outcome-benefit animate-on-scroll delay-2">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                </svg>
              </div>
              <h3>Reduce creative waste.</h3>
              <p>
                Stop producing dozens of variations hoping one hits. Every ad is informed
                by real patterns.
              </p>
            </div>

            <div className="outcome-benefit animate-on-scroll delay-3">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 6l-9.5 9.5-5-5L1 18"/>
                  <path d="M17 6h6v6"/>
                </svg>
              </div>
              <h3>Compound performance over time.</h3>
              <p>
                The system learns from every conversion. Your results don't plateau—they accelerate.
              </p>
            </div>

            <div className="outcome-benefit animate-on-scroll delay-4">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <h3>Save hundreds of thousands in headcount.</h3>
              <p>
                Replace the need for additional media buyers, analysts, and creative strategists
                with a system that does their job—better, faster, and without the overhead.
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

            <p className="credibility-lead">Our clients come to us because they've tried the alternatives:</p>
            <ul className="alternatives-list">
              <li>Agencies that bill hours but can't explain what's actually working.</li>
              <li>AI tools that generate volume but not quality.</li>
              <li>In-house teams stretched too thin to interpret and act on data fast enough.</li>
            </ul>
            <p className="credibility-close">
              They come to Convertra because they're <strong>done guessing</strong>.
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
                <p>Our proprietary engine that extracts, interprets, and generates—configured to your business.</p>
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
                <h3>Automated Creative Generation</h3>
                <p>Ads generated from your proven conversion patterns—ready to deploy.</p>
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
                <p>Clear, actionable insights—not vanity metrics. You'll know exactly what's working and why.</p>
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
            Enterprise Pricing Only—<br />
            <span className="header-emphasis">For Now</span>
          </h2>
          <p className="pricing-intro animate-on-scroll delay-1">
            Convertra isn't a self-serve tool you sign up for and figure out on your own.<br />
            <strong>It's a partnership.</strong>
          </p>

          <div className="pricing-card gradient-border-card animate-on-scroll delay-2">
            <div className="card-gradient-border"></div>
            <div className="card-inner">
              <div className="pricing-badge">Enterprise</div>
              <h3 className="pricing-title">White-Glove Implementation & Management</h3>

              <p className="pricing-description">
                When you partner with Convertra, you don't just get software—you get a dedicated team
                member who becomes an extension of your organization.
              </p>

              <div className="pricing-features">
                <div className="pricing-feature">
                  <div className="pricing-feature-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </div>
                  <div className="pricing-feature-content">
                    <h4>Dedicated Partnership</h4>
                    <p>A team member who partners with you to install, set up, and customize your solution—not a support ticket.</p>
                  </div>
                </div>

                <div className="pricing-feature">
                  <div className="pricing-feature-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                    </svg>
                  </div>
                  <div className="pricing-feature-content">
                    <h4>Custom Software Solution</h4>
                    <p>Your own custom-built system configured to your unique business needs, channels, and conversion goals.</p>
                  </div>
                </div>

                <div className="pricing-feature">
                  <div className="pricing-feature-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                      <path d="M2 17l10 5 10-5"/>
                      <path d="M2 12l10 5 10-5"/>
                    </svg>
                  </div>
                  <div className="pricing-feature-content">
                    <h4>Managed Integration</h4>
                    <p>We handle every integration, becoming a seamless extension of your team—so you focus on results, not setup.</p>
                  </div>
                </div>

                <div className="pricing-feature">
                  <div className="pricing-feature-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <div className="pricing-feature-content">
                    <h4>Ongoing White-Glove Service</h4>
                    <p>Continuous optimization, monitoring, and evolution of your system—without lifting a finger.</p>
                  </div>
                </div>
              </div>

              <div className="pricing-why">
                <p className="pricing-why-title">Why enterprise only—for now?</p>
                <p className="pricing-why-text">
                  Because every implementation is fully custom and bespoke. We study your business,
                  configure the system to your patterns, and manage it end-to-end. This level of
                  white-glove service requires dedicated attention and expertise that doesn't scale
                  with self-serve signups—at least not yet.
                </p>
              </div>

              <div className="pricing-cta">
                <a href={calendarUrl} className="cta-primary cta-large">
                  Schedule a Demo
                </a>
                <p className="pricing-cta-note">
                  Let's discuss your needs and see if we're the right fit.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Risk Reversal / Urgency Section */}
      <section id="urgency" className="section urgency-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">The Cost of Waiting</h2>

          <div className="urgency-content animate-on-scroll delay-1">
            <p>Every month you spend guessing is a month of wasted ad spend.</p>
            <p>Every quarter you spend testing is budget your competitors are converting.</p>
            <p className="urgency-emphasis">
              The data that could be generating winning ads right now is sitting in your
              dashboards, <strong>unused</strong>.
            </p>
            <p>ConversionIQ™ exists to unlock it.</p>
            <p className="urgency-scarcity">
              But because every implementation is bespoke—built and managed by our team—we
              only take on a <strong>limited number of clients</strong> at any time.
            </p>
            <p className="urgency-close">
              If you're serious about eliminating waste and compounding performance, let's talk.
            </p>
          </div>

          {/* Urgency Visual */}
          <div className="urgency-visual animate-on-scroll delay-2">
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
      </section>

      {/* Final CTA Section */}
      <section id="contact" className="section cta-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            Ready to See What Your Data Already Knows?
          </h2>

          <div className="cta-content animate-on-scroll delay-1">
            <p className="cta-intro">Request a custom assessment and we'll show you:</p>
            <ul className="cta-list">
              <li>Where conversion insights are hiding in your current data.</li>
              <li>What ConversionIQ™ would reveal about your top-performing ads.</li>
              <li>How a bespoke implementation would work for your business.</li>
            </ul>
            <p className="cta-reassurance">
              No obligation. No generic pitch deck.<br />
              Just a conversation about your data and what's possible.
            </p>
            <div className="cta-final">
              <a href={calendarUrl} className="cta-primary cta-large pulse-glow">
                Schedule Custom Demo
              </a>
              <p className="cta-subtext">Limited availability. Enterprise clients only.</p>
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
              Your data already knows what converts. Now you will too.
            </p>
          </div>
          <div className="footer-links">
            <a href="#hero">Home</a>
            <a href="#mechanism">How It Works</a>
            <a href="#offer">What You Get</a>
            <a href="#pricing">Pricing</a>
            <a href={calendarUrl}>Contact</a>
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
