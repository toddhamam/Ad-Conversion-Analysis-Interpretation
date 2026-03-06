import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Player } from '@remotion/player';
import SEO, { organizationSchema, softwareApplicationSchema, agencyFaqSchema } from '../components/SEO';
import { ConvertraVSL } from '../remotion/ConvertraVSL';
import { DemoVideo } from '../remotion/DemoVideo';
import { VIDEO_CONFIG, DEMO_VIDEO_CONFIG } from '../remotion/brand';
import VSLPoster from '../components/sales/VSLPoster';
import DemoPoster from '../components/sales/DemoPoster';
import { useSalesPageEffects } from '../components/sales/useSalesPageEffects';
import './SalesLanding.css';

function AgencySalesLanding() {
  const { isScrolled, isMobileMenuOpen, toggleMobileMenu } = useSalesPageEffects();

  // ROI Calculator state — agency defaults
  const [clientAccounts, setClientAccounts] = useState(10);
  const [mediaBuyers, setMediaBuyers] = useState(3);
  const [costPerBuyer, setCostPerBuyer] = useState(10000);
  const [adsPerClientPerWeek, setAdsPerClientPerWeek] = useState(2);
  const [daysToLaunch, setDaysToLaunch] = useState(5);

  // ROI calculations — agency economics
  const currentAccountsPerBuyer = Math.max(1, Math.round(clientAccounts / mediaBuyers));
  const withConvertraAccountsPerBuyer = currentAccountsPerBuyer * 4;
  const buyersNeededWithConvertra = Math.max(1, Math.ceil(clientAccounts / withConvertraAccountsPerBuyer));
  const buyersSaved = Math.max(0, mediaBuyers - buyersNeededWithConvertra);
  const annualBuyerSavings = buyersSaved * costPerBuyer * 12;
  const annualTimeSaved = clientAccounts * adsPerClientPerWeek * (daysToLaunch * 4) * 52;
  const totalWeeklyAdsNow = clientAccounts * adsPerClientPerWeek;
  const totalWeeklyAdsWithConvertra = clientAccounts * 10; // 10 ads per client/week with ConversionIQ
  const velocityMultiple = Math.round(totalWeeklyAdsWithConvertra / Math.max(1, totalWeeklyAdsNow));
  const marginImprovement = Math.round((buyersSaved / Math.max(1, mediaBuyers)) * 100);

  const formatCurrency = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${Math.round(value).toLocaleString()}`;
  };

  const calendarUrl = 'https://lunacal.ai/todd-hamam/convertra-live-demo?utm_source=website&utm_medium=landing&utm_campaign=agencies';

  return (
    <div className="sales-landing">
      {/* SEO Meta Tags & Structured Data */}
      <SEO
        title="AI Ad Creatives for Agencies | Scale Client Campaigns on Autopilot"
        description="Launch high-converting ads across every client account in under 3 minutes. ConversionIQ™ helps agencies increase account capacity, improve margins, and eliminate creative bottlenecks — without hiring more media buyers."
        keywords="agency ad creative automation, multi-client ad management, media buying agency tool, agency ad scaling, client ad campaign automation, agency creative production, ConversionIQ for agencies, ad agency software, scale agency operations"
        canonical="/for-agencies"
        jsonLd={[organizationSchema, softwareApplicationSchema, agencyFaqSchema]}
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
            <a href="#demo">See It In Action</a>
            <a href="#offer">What You Get</a>
            <a href="#pricing">Pricing</a>
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
          <a href="#demo">See It In Action</a>
          <a href="#offer">What You Get</a>
          <a href="#pricing">Pricing</a>
          <Link to="/login" className="mobile-login">Log in</Link>
          <a href={calendarUrl} className="mobile-cta">Schedule Demo</a>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="hero" className="section hero-section">
        <div className="hero-content">
          <h1 className="hero-headline animate-on-scroll">
            <span className="headline-main">Launch High-Converting Ads Across Every Client Account. In Minutes.</span>
            <span className="headline-sub">While Other Agencies Are Still Briefing Designers</span>
          </h1>
          <p className="hero-subhead animate-on-scroll delay-1">
            <span className="highlight">ConversionIQ™</span> generates, launches, and scales winning ads across all your client accounts — based on real conversion data. Under 3 minutes per account.
          </p>
          <p className="hero-supporting animate-on-scroll delay-2">
            The autonomous creative intelligence platform for agencies that want to increase account capacity, improve margins, and eliminate the creative production bottleneck.
          </p>

          {/* Hero VSL */}
          <div className="hero-demo animate-on-scroll delay-3">
            <div className="demo-container">
              <p className="demo-caption">Launch high-converting ads in under 3 minutes — <span className="highlight">See ConversionIQ™ in action</span></p>
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
            </div>
          </div>

          <div className="hero-cta-group animate-on-scroll delay-4">
            <a href={calendarUrl} className="cta-primary">
              Schedule Agency Demo
            </a>
            <p className="cta-subtext">See how agencies scale creative output across all client accounts.</p>
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
            Your Clients Need Fresh Ads. Yesterday.<br />
            <span className="header-emphasis">You're Stuck in the <span className="brush-underline">Feedback Loop</span></span>
          </h2>

          {/* Visual Demo Placeholder - Dashboard comparison */}
          <div className="visual-placeholder animate-on-scroll delay-1">
            <div className="placeholder-gradient-border"></div>
            <div className="placeholder-inner">
              <div className="comparison-visual">
                <div className="comparison-side">
                  <span className="comparison-label">Manual Process</span>
                  <div className="fake-dashboard">
                    <div className="dash-row"></div>
                    <div className="dash-row"></div>
                    <div className="dash-row"></div>
                    <div className="dash-question">1 ad/client/week</div>
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
                    <div className="dash-insight">10+ ads/client/day</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="problem-content animate-on-scroll delay-2">
            <p>
              You've got the client briefs. The designers. The media buyers. And still — launching a new ad creative for just <em>one</em> client takes days.
            </p>
            <p>
              Now multiply that across 5, 10, 20 client accounts.
            </p>
            <p className="problem-callout">
              Brief the client. Brief the designer. Wait for design. Review and revise. Finally launch. <strong>One ad. For one client. Repeat.</strong>
            </p>
            <ul className="problem-list">
              <li>Days to produce a single creative variation — per client.</li>
              <li>Multiply that across every account in your portfolio.</li>
              <li>Months of overhead before you see what actually converts.</li>
            </ul>
            <p>
              Meanwhile, you're trapped in the same cycle as every other agency:
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
                  <span className="loop-text">Brief the client</span>
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
                  <span className="loop-text">One client. Repeat.</span>
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
              <div className="loop-label">The Agency Bottleneck</div>
            </div>
            <div className="problem-pain">
              <p>Every day stuck in this cycle is a day your clients could be looking for a faster agency.</p>
              <p>Every creative that takes a week to produce is dozens of tests you never ran — across every single client.</p>
              <p className="pain-emphasis">And the worst part?</p>
              <p><strong>The bottleneck isn't talent. It's velocity. And it's costing you clients.</strong></p>
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
            ConversionIQ™ does what growing agency teams can't.<br />
            <strong>It launches, tests, and scales winning creatives across all your client accounts — at a velocity no team can match.</strong>
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

          <div className="mechanism-steps animate-on-scroll delay-3">
            <div className="mechanism-step">
              <div className="step-number">01</div>
              <h3 className="step-title">Extract</h3>
              <p className="step-description">
                Connects to each client's ad account and continuously ingests performance data — building a unique intelligence layer per client that's always learning.
              </p>
            </div>

            <div className="mechanism-step">
              <div className="step-number">02</div>
              <h3 className="step-title">Interpret</h3>
              <p className="step-description">
                Deep pattern analysis on every conversion — identifying the exact creative elements, copy structures, and audience signals that drive action for each client.
              </p>
            </div>

            <div className="mechanism-step">
              <div className="step-number">03</div>
              <h3 className="step-title">Generate</h3>
              <p className="step-description">
                Autonomously engineers new ad creatives — copy, visuals, and targeting — from each client's proven conversion patterns. Not templates. Real intelligence, per account.
              </p>
            </div>

            <div className="mechanism-step">
              <div className="step-number">04</div>
              <h3 className="step-title">Repeat</h3>
              <p className="step-description">
                Every creative tested makes the next one smarter — for every client. Your creative velocity compounds across your entire portfolio.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* See It In Action — standalone product demo video */}
      <section id="demo" className="section see-it-in-action-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            See It In Action.<br />
            <span className="header-emphasis">Zero to High-Converting Ads Published in <span className="brush-underline">Under 3 Minutes</span>.</span>
          </h2>
          <p className="see-it-sub animate-on-scroll delay-1">
            No slides. No mockups. Watch <span className="highlight">ConversionIQ™</span> generate and publish real ads — live.
          </p>
          <div className="see-it-player animate-on-scroll delay-2">
            <div className="demo-container">
              <div className="vsl-player-wrapper">
                <div className="demo-gradient-border"></div>
                <Player
                  component={DemoVideo}
                  durationInFrames={DEMO_VIDEO_CONFIG.durationInFrames}
                  fps={DEMO_VIDEO_CONFIG.fps}
                  compositionWidth={DEMO_VIDEO_CONFIG.width}
                  compositionHeight={DEMO_VIDEO_CONFIG.height}
                  style={{
                    width: '100%',
                    aspectRatio: '16 / 9',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                  controls
                  renderPoster={({ width, height }: { width: number; height: number }) => (
                    <DemoPoster width={width} height={height} />
                  )}
                  posterFillMode="player-size"
                  showPosterWhenUnplayed
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Agency Differentiator Section */}
      <section id="bespoke" className="section bespoke-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            Increase Account Capacity.<br />
            <span className="header-emphasis">Without Increasing Headcount.</span>
          </h2>

          <div className="bespoke-intro animate-on-scroll delay-1">
            <p>Let's be clear about what Convertra is <em>not</em>.</p>
            <ul className="not-list">
              <li>It's not another tool that generates generic content your clients won't approve.</li>
              <li>It's not another platform that takes weeks to learn and still can't produce at scale.</li>
              <li>It's not another hire who costs $10K/month and can only manage a handful of accounts.</li>
            </ul>
            <p className="bespoke-statement">
              <strong>Convertra is an autonomous creative intelligence platform that lets your agency produce and launch high-converting ads across every client account — in minutes, not days.</strong>
            </p>
          </div>

          <p className="bespoke-lead animate-on-scroll delay-2">Here's what that means for your agency:</p>

          <div className="bespoke-features animate-on-scroll delay-2">
            <div className="bespoke-feature">
              <div className="bespoke-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <h3>Multi-Client Scaling</h3>
              <p>
                Connect every client's ad account. ConversionIQ™ analyzes each client's unique conversion patterns and generates ads tailored to their audience. No more copying templates between accounts.
              </p>
            </div>

            <div className="bespoke-feature">
              <div className="bespoke-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <h3>Eliminate Designer Bottlenecks</h3>
              <p>
                Stop waiting days for designers to deliver. ConversionIQ™ generates professional ad creatives — copy, images, and targeting — based on real conversion data. Launch in under 3 minutes per account.
              </p>
            </div>

            <div className="bespoke-feature">
              <div className="bespoke-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M23 6l-9.5 9.5-5-5L1 18"/>
                  <path d="M17 6h6v6"/>
                </svg>
              </div>
              <h3>Increase Capacity Per Operator</h3>
              <p>
                One platform operator can now produce the creative output of multiple media buyers. Scale your client portfolio without scaling your payroll.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Outcome Section */}
      <section id="outcome" className="section outcome-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            Scale Every Client Account—<br />
            <span className="header-emphasis">Without Scaling Your Team</span>
          </h2>

          <p className="outcome-intro animate-on-scroll delay-1">
            When your agency uses Convertra, you're not waiting on designers or stretching your media buyers thin.<br />
            You're deploying dozens of creatives per client — <strong>engineered from each client's proven conversion patterns</strong> — in minutes.
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
                <p className="metrics-caption">Average results across client accounts</p>
              </div>
            </div>
          </div>

          <p className="outcome-lead animate-on-scroll delay-3">Here's what that looks like for your agency:</p>

          <div className="outcome-benefits">
            <div className="outcome-benefit animate-on-scroll delay-1">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <h3>Eliminate the feedback loop.</h3>
              <p>
                No more back-and-forth with designers. ConversionIQ™ generates ready-to-launch creatives
                based on each client's actual conversion data — not guesswork.
              </p>
            </div>

            <div className="outcome-benefit animate-on-scroll delay-2">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                </svg>
              </div>
              <h3>Scale clients without scaling headcount.</h3>
              <p>
                Take on more client accounts without hiring more media buyers or designers.
                One operator handles what used to require a team.
              </p>
            </div>

            <div className="outcome-benefit animate-on-scroll delay-3">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 6l-9.5 9.5-5-5L1 18"/>
                  <path d="M17 6h6v6"/>
                </svg>
              </div>
              <h3>Deliver better results, faster.</h3>
              <p>
                Launch dozens of variations per client, find winners faster, and show clients
                measurable performance improvement from day one.
              </p>
            </div>

            <div className="outcome-benefit animate-on-scroll delay-4">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <h3>Improve your cost-to-serve.</h3>
              <p>
                Reduce the team hours required per client account. Increase your margin
                on every engagement — without cutting corners on quality.
              </p>
            </div>

            <div className="outcome-benefit animate-on-scroll delay-5">
              <div className="benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <path d="M22 4L12 14.01l-3-3"/>
                </svg>
              </div>
              <h3>Focus on strategy, not production.</h3>
              <p>
                Let ConversionIQ™ handle creative production and testing. Your team focuses on
                client relationships and strategic direction.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility/Proof Section */}
      <section id="credibility" className="section credibility-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            Built for Growth Agencies<br />
            <span className="header-emphasis">Scaling Paid Media Operations</span>
          </h2>

          <div className="credibility-content animate-on-scroll delay-1">
            <p className="credibility-statement">
              Convertra isn't for every agency.
            </p>
            <p>
              We work with agencies managing <strong>multiple client ad accounts</strong> who
              understand that creative velocity is the difference between retaining clients and losing them.
            </p>
            <p className="credibility-emphasis">It's the difference between growing your book and plateauing.</p>

            <p className="credibility-lead">Our agency partners come to us because they've hit the ceiling with the alternatives:</p>
            <ul className="alternatives-list">
              <li>Freelance designers who can't keep up with multi-client volume.</li>
              <li>Additional media buyers who increase payroll but not margin.</li>
              <li>AI tools that generate volume but not quality clients will approve.</li>
            </ul>
            <p className="credibility-close">
              They come to Convertra because they're <strong>done being the bottleneck for their own clients</strong>.
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
                  Agency testimonial will go here. This is placeholder text for an agency partner success story.
                </p>
                <div className="testimonial-author">
                  <div className="author-avatar"></div>
                  <div className="author-info">
                    <span className="author-name">Agency Partner Name</span>
                    <span className="author-title">Founder, Agency Name</span>
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
          <p className="offer-intro animate-on-scroll delay-1">When your agency partners with Convertra, you receive:</p>

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
                <p>Our autonomous creative engine configured for multi-client operations. Each client account gets its own conversion intelligence layer.</p>
              </div>
            </div>

            <div className="offer-item gradient-border-card animate-on-scroll delay-2">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="offer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                </div>
                <h3>Rapid Onboarding</h3>
                <p>Connect client ad accounts in minutes. ConversionIQ™ auto-analyzes each account's conversion history and starts generating immediately.</p>
              </div>
            </div>

            <div className="offer-item gradient-border-card animate-on-scroll delay-3">
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
                <h3>Multi-Account Management</h3>
                <p>Switch between client accounts instantly. Generate, review, and launch ads across your entire portfolio from one platform.</p>
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
                <p>Dozens of creatives generated, launched, and scaled autonomously from each client's proven conversion patterns.</p>
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
                <h3>Client-Ready Reporting</h3>
                <p>Clear, client-facing performance data. Show clients exactly how their ads are performing and improving — without building reports manually.</p>
              </div>
            </div>

            <div className="offer-item gradient-border-card animate-on-scroll delay-6">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="offer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <h3>Dedicated Support</h3>
                <p>Priority support from a team that understands agency workflows and multi-client operations.</p>
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
            <strong>Choose how your agency wants to run it from there.</strong>
          </p>

          <div className="pricing-cards-grid">
            {/* Agency Self-Service */}
            <div className="pricing-card gradient-border-card animate-on-scroll delay-2">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="pricing-badge">Agency</div>
                <h3 className="pricing-title">Self-Service</h3>
                <p className="pricing-tagline">We set it up. Your team runs it across all client accounts.</p>

                <div className="pricing-price-block">
                  <div className="pricing-price-custom">Custom Pricing</div>
                  <div className="pricing-setup-fee">Schedule a demo to learn more</div>
                </div>

                <p className="pricing-description">
                  We install and configure your Convertra platform for multi-client operations, then hand the keys to your team. A dedicated point of contact is always available.
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
                    Your team drives day-to-day across all clients
                  </li>
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Unlimited creatives &amp; analyses per account
                  </li>
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Multi-account switching &amp; management
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

            {/* Agency Partner */}
            <div className="pricing-card pricing-card-featured gradient-border-card animate-on-scroll delay-3">
              <div className="card-gradient-border"></div>
              <div className="card-inner">
                <div className="pricing-badge pricing-badge-featured">Agency Partner</div>
                <h3 className="pricing-title">Full Partnership</h3>
                <p className="pricing-tagline">We set it up. We help you run it.</p>

                <div className="pricing-price-block">
                  <div className="pricing-price-custom">Custom Pricing</div>
                  <div className="pricing-setup-fee">Schedule a demo to learn more</div>
                </div>

                <p className="pricing-description">
                  Everything in Agency, plus a dedicated Convertra specialist who helps manage creative output across your client portfolio. Set your weekly quota — we help you hit it.
                </p>

                <ul className="pricing-checklist">
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Everything in Agency, plus:
                  </li>
                  <li className="pricing-checklist-highlight">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Dedicated Convertra creative specialist
                  </li>
                  <li className="pricing-checklist-highlight">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
                    Weekly creative output quota per client
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
                    Higher creative throughput, better client results
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
            <p className="pricing-why-title">Why agency-focused pricing?</p>
            <p className="pricing-why-text">
              Because we build the system around your agency's workflow and client portfolio.
              Custom pricing ensures the platform scales with your book of business — whether
              you're managing 5 accounts or 50.
            </p>
          </div>
        </div>
      </section>

      {/* Risk Reversal / Urgency Section */}
      <section id="urgency" className="section urgency-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">The Cost of Waiting</h2>
          <p className="urgency-subtitle animate-on-scroll delay-1">
            Every month without ConversionIQ™, the creative bottleneck is costing your agency across three areas most teams never audit.
          </p>

          <div className="cost-cards animate-on-scroll delay-2">
            <div className="cost-card">
              <div className="cost-card-amount">$80–100K<span className="cost-card-period">/year</span></div>
              <h3 className="cost-card-title">Excess Headcount</h3>
              <p className="cost-card-desc">
                Each additional media buyer costs $8–12K/month — and can only manage a handful of accounts effectively. ConversionIQ™ lets one operator produce creative output across your entire portfolio.
              </p>
            </div>

            <div className="cost-card">
              <div className="cost-card-amount">$100K+<span className="cost-card-period">/year</span></div>
              <h3 className="cost-card-title">Slow Creative Turnaround</h3>
              <p className="cost-card-desc">
                3–5 day turnarounds per client mean missed optimization windows and stale ads. When clients see slow results, they look for a faster agency. ConversionIQ™ launches in under 3 minutes per account.
              </p>
            </div>

            <div className="cost-card">
              <div className="cost-card-amount">$50–75K<span className="cost-card-period">/year</span></div>
              <h3 className="cost-card-title">Client Churn From Creative Fatigue</h3>
              <p className="cost-card-desc">
                When ad performance drops and your team takes weeks to refresh creatives, clients start shopping for a new agency. ConversionIQ™ detects fatigue and generates proven replacements before performance drops.
              </p>
            </div>
          </div>

          <div className="cost-total animate-on-scroll delay-3">
            <div className="cost-total-inner">
              <p className="cost-total-label">Total hidden cost of the status quo</p>
              <p className="cost-total-amount">$230–275K <span className="cost-total-period">per year</span></p>
              <p className="cost-total-note">And that's before counting the clients you're losing to agencies that move faster.</p>
              <div className="cost-total-cta">
                <p className="cost-total-cta-text">But what are <em>your agency's</em> actual numbers?</p>
                <a href="#roi-calculator" className="cost-total-cta-btn">
                  Calculate Your Agency's Savings
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M12 5v14M5 12l7 7 7-7"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="urgency-close-wrapper animate-on-scroll delay-3">
            <p className="urgency-scarcity">
              We're onboarding a <strong>limited number of agency partners</strong> to ensure
              quality support and successful adoption.
            </p>
            <div className="urgency-visual">
              <div className="countdown-placeholder">
                <span className="spots-label">Limited agency spots available</span>
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

      {/* ROI Calculator Section — Agency Economics */}
      <section id="roi-calculator" className="section roi-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            What Could ConversionIQ™ Save <span className="header-emphasis">Your Agency</span>?
          </h2>
          <p className="roi-subtitle animate-on-scroll delay-1">
            Enter your numbers below. See what autonomous creative velocity is worth to your agency's bottom line.
          </p>

          <div className="roi-card animate-on-scroll delay-2">
            <div className="roi-calculator">
              <div className="roi-inputs">
                <div className="roi-input-row">
                  <div className="roi-input-header">
                    <label className="roi-input-label" htmlFor="roi-client-accounts">Client Ad Accounts</label>
                    <span className="roi-input-value" aria-live="polite">{clientAccounts} {clientAccounts === 1 ? 'account' : 'accounts'}</span>
                  </div>
                  <input
                    type="range"
                    id="roi-client-accounts"
                    className="roi-slider"
                    min={3}
                    max={50}
                    step={1}
                    value={clientAccounts}
                    onChange={(e) => setClientAccounts(Number(e.target.value))}
                    aria-label="Number of client ad accounts"
                  />
                </div>

                <div className="roi-input-row">
                  <div className="roi-input-header">
                    <label className="roi-input-label" htmlFor="roi-media-buyers">Media Buyers / Creative Team</label>
                    <span className="roi-input-value" aria-live="polite">{mediaBuyers} {mediaBuyers === 1 ? 'person' : 'people'}</span>
                  </div>
                  <input
                    type="range"
                    id="roi-media-buyers"
                    className="roi-slider"
                    min={1}
                    max={15}
                    step={1}
                    value={mediaBuyers}
                    onChange={(e) => setMediaBuyers(Number(e.target.value))}
                    aria-label="Media buyers and creative team size"
                  />
                </div>

                <div className="roi-input-row">
                  <div className="roi-input-header">
                    <label className="roi-input-label" htmlFor="roi-cost-buyer">Avg. Cost per Team Member</label>
                    <span className="roi-input-value" aria-live="polite">${costPerBuyer.toLocaleString()}/mo</span>
                  </div>
                  <input
                    type="range"
                    id="roi-cost-buyer"
                    className="roi-slider"
                    min={3000}
                    max={25000}
                    step={500}
                    value={costPerBuyer}
                    onChange={(e) => setCostPerBuyer(Number(e.target.value))}
                    aria-label="Average monthly cost per team member"
                  />
                </div>

                <div className="roi-input-row">
                  <div className="roi-input-header">
                    <label className="roi-input-label" htmlFor="roi-ads-per-client">Ads Produced per Client / Week</label>
                    <span className="roi-input-value" aria-live="polite">{adsPerClientPerWeek} {adsPerClientPerWeek === 1 ? 'ad' : 'ads'}</span>
                  </div>
                  <input
                    type="range"
                    id="roi-ads-per-client"
                    className="roi-slider"
                    min={1}
                    max={10}
                    step={1}
                    value={adsPerClientPerWeek}
                    onChange={(e) => setAdsPerClientPerWeek(Number(e.target.value))}
                    aria-label="Ads produced per client per week"
                  />
                </div>

                <div className="roi-input-row">
                  <div className="roi-input-header">
                    <label className="roi-input-label" htmlFor="roi-days-launch">Days from Brief to Launch</label>
                    <span className="roi-input-value" aria-live="polite">{daysToLaunch} {daysToLaunch === 1 ? 'day' : 'days'}</span>
                  </div>
                  <input
                    type="range"
                    id="roi-days-launch"
                    className="roi-slider"
                    min={1}
                    max={14}
                    step={1}
                    value={daysToLaunch}
                    onChange={(e) => setDaysToLaunch(Number(e.target.value))}
                    aria-label="Days from creative brief to ad launch"
                  />
                </div>
              </div>

              <div className="roi-divider"></div>

              <div className="roi-results">
                <div className="roi-results-primary">
                  <div className="roi-result-card">
                    <div className="roi-result-value">{formatCurrency(annualBuyerSavings)}</div>
                    <div className="roi-result-label">Annual Team Cost Savings</div>
                    <div className="roi-result-detail">
                      {buyersSaved > 0
                        ? `${buyersSaved} fewer team member${buyersSaved > 1 ? 's' : ''} needed at current capacity`
                        : 'Handle 4x more accounts with current team'}
                    </div>
                  </div>
                  <div className="roi-result-card">
                    <div className="roi-result-value">{withConvertraAccountsPerBuyer} accounts</div>
                    <div className="roi-result-label">Accounts per Operator</div>
                    <div className="roi-result-detail">Up from {currentAccountsPerBuyer} accounts today</div>
                  </div>
                  <div className="roi-result-card roi-result-card-primary">
                    <div className="roi-result-value roi-result-total">{marginImprovement > 0 ? `${marginImprovement}%` : '4x'}</div>
                    <div className="roi-result-label">{marginImprovement > 0 ? 'Margin Improvement' : 'Capacity Increase'}</div>
                  </div>
                </div>

                <div className="roi-results-secondary">
                  <div className="roi-result-secondary">
                    <span className="roi-secondary-value">{velocityMultiple}x</span>
                    <span className="roi-secondary-label">Creative Velocity Increase</span>
                  </div>
                  <div className="roi-result-secondary">
                    <span className="roi-secondary-value">{annualTimeSaved.toLocaleString()}</span>
                    <span className="roi-secondary-label">Team Hours Freed Per Year</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="roi-cta-row animate-on-scroll delay-4">
              <p className="roi-disclaimer">
                Estimates based on agency benchmarks. Schedule a custom assessment for your agency.
              </p>
              <a href={calendarUrl} className="cta-primary">
                Get Your Custom Agency Assessment
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section id="contact" className="section cta-section">
        <div className="section-container">
          <h2 className="section-header animate-on-scroll">
            Ready to Scale Your Agency's Creative Output?
          </h2>

          <div className="cta-content animate-on-scroll delay-1">
            <p className="cta-intro">Request a custom assessment and we'll show you:</p>
            <ul className="cta-list">
              <li>How many creatives ConversionIQ™ could produce across all your client accounts.</li>
              <li>The conversion patterns hiding in your clients' ad data.</li>
              <li>How your agency can serve more clients without adding headcount.</li>
            </ul>
            <p className="cta-reassurance">
              No obligation. No generic pitch deck.<br />
              Just a conversation about what autonomous creative velocity looks like for your agency.
            </p>
            <div className="cta-final">
              <a href={calendarUrl} className="cta-primary cta-large pulse-glow">
                Schedule Agency Demo
              </a>
              <p className="cta-subtext">For agencies managing multiple client ad accounts.</p>
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
            <a href="#roi-calculator">ROI Calculator</a>
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

export default AgencySalesLanding;
