import type { ChannelAnalysisResult } from '../services/openaiApi';
import './ChannelInsightsPanel.css';

interface ChannelInsightsPanelProps {
  analysis: ChannelAnalysisResult;
}

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function getScoreColor(score: number): string {
  if (score >= 8) return '#10b981';
  if (score >= 6) return '#f59e0b';
  return '#ef4444';
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ChannelInsightsPanel({ analysis }: ChannelInsightsPanelProps) {
  const { performanceBreakdown } = analysis;

  return (
    <div className="channel-insights-panel">
      {/* Executive Summary */}
      <section className="insights-section executive-summary">
        <div className="section-header">
          <h3>Executive Summary</h3>
          <span className="analyzed-at">Analyzed {formatDate(analysis.analyzedAt)}</span>
        </div>
        <div className="summary-content">
          <div className="health-score" style={{ borderColor: getScoreColor(analysis.overallHealthScore) }}>
            <span className="score-value" style={{ color: getScoreColor(analysis.overallHealthScore) }}>
              {analysis.overallHealthScore}
            </span>
            <span className="score-label">/10</span>
            <span className="score-title">Health Score</span>
          </div>
          <div className="summary-text">
            <p>{analysis.executiveSummary}</p>
          </div>
        </div>
      </section>

      {/* Performance Metrics */}
      <section className="insights-section metrics-overview">
        <h3>Performance Overview</h3>
        <div className="metrics-grid">
          <div className="metric-card">
            <span className="metric-value">{performanceBreakdown.totalAdsAnalyzed}</span>
            <span className="metric-label">Ads Analyzed</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{formatCurrency(performanceBreakdown.totalSpend)}</span>
            <span className="metric-label">Total Spend</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{performanceBreakdown.totalConversions}</span>
            <span className="metric-label">Conversions</span>
          </div>
          <div className="metric-card highlight">
            <span className="metric-value">{formatPercent(performanceBreakdown.avgConversionRate)}</span>
            <span className="metric-label">Avg Conv Rate</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{formatCurrency(performanceBreakdown.avgCostPerConversion)}</span>
            <span className="metric-label">Avg Cost/Conv</span>
          </div>
          <div className="metric-card tier-breakdown">
            <div className="tier-item high">
              <span className="tier-count">{performanceBreakdown.highPerformers}</span>
              <span className="tier-label">High</span>
            </div>
            <div className="tier-item mid">
              <span className="tier-count">{performanceBreakdown.midPerformers}</span>
              <span className="tier-label">Mid</span>
            </div>
            <div className="tier-item low">
              <span className="tier-count">{performanceBreakdown.lowPerformers}</span>
              <span className="tier-label">Low</span>
            </div>
          </div>
        </div>
      </section>

      {/* NEW: Visual/Creative Analysis Section */}
      {analysis.visualAnalysis && (
        <section className="insights-section visual-analysis-section">
          <h3>Visual & Creative Analysis</h3>
          <div className="visual-analysis-grid">
            <div className="visual-card winning-visuals">
              <h4>Winning Visual Elements</h4>
              <ul>
                {analysis.visualAnalysis.winningVisualElements?.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="visual-card losing-visuals">
              <h4>Visual Elements to Avoid</h4>
              <ul>
                {analysis.visualAnalysis.losingVisualElements?.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="visual-card color-psychology">
              <h4>Color Psychology</h4>
              <p>{analysis.visualAnalysis.colorPsychology}</p>
            </div>
            <div className="visual-card imagery-patterns">
              <h4>Imagery Patterns</h4>
              <p>{analysis.visualAnalysis.imageryPatterns}</p>
            </div>
            <div className="visual-card in-image-messaging">
              <h4>In-Image Messaging</h4>
              <p>{analysis.visualAnalysis.inImageMessaging}</p>
            </div>
            <div className="visual-card psychological-triggers">
              <h4>Psychological Triggers</h4>
              <div className="tags">
                {analysis.visualAnalysis.psychologicalTriggers?.map((item, i) => (
                  <span key={i} className="tag psychology">{item}</span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* NEW: Same Headline, Different Image Analysis */}
      {analysis.headlineImageAnalysis && analysis.headlineImageAnalysis.length > 0 && (
        <section className="insights-section headline-image-section">
          <h3>Same Headline, Different Image Performance</h3>
          <p className="section-description">
            These headlines were tested with different images. The IMAGE was the key differentiator in conversion performance.
          </p>
          <div className="headline-image-list">
            {analysis.headlineImageAnalysis.map((item, i) => (
              <div key={i} className="headline-image-card">
                <div className="headline-image-header">
                  <h4>"{item.headline}"</h4>
                  <span className="variation-count">{item.variations?.length || 0} variations</span>
                </div>
                <div className="variations-list">
                  {item.variations?.map((variation, j) => (
                    <div key={j} className={`variation-item ${variation.conversionRate > 5 ? 'high-performer' : variation.conversionRate > 0 ? 'mid-performer' : 'low-performer'}`}>
                      <div className="variation-header">
                        <span className="variation-id">Ad {variation.adId}</span>
                        <span className="variation-cvr">{formatPercent(variation.conversionRate)} CVR</span>
                      </div>
                      <p className="image-description">{variation.imageDescription}</p>
                      <p className="why-converts">{variation.whyItConverts}</p>
                    </div>
                  ))}
                </div>
                <div className="key-differentiator">
                  <span className="differentiator-label">Key Differentiator:</span>
                  <p>{item.keyDifferentiator}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Patterns Analysis (Enhanced with Visual Elements) */}
      <section className="insights-section patterns-section">
        <h3>Pattern Analysis</h3>
        <div className="patterns-grid">
          <div className="pattern-card winning">
            <h4>What's Working</h4>
            <div className="pattern-group">
              <span className="pattern-label">Winning Headlines</span>
              <ul>
                {analysis.winningPatterns.headlines?.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="pattern-group">
              <span className="pattern-label">Effective Copy Elements</span>
              <ul>
                {analysis.winningPatterns.copyElements?.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            {/* NEW: Visual Elements */}
            {analysis.winningPatterns.visualElements && analysis.winningPatterns.visualElements.length > 0 && (
              <div className="pattern-group">
                <span className="pattern-label">Winning Visual Elements</span>
                <ul>
                  {analysis.winningPatterns.visualElements.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pattern-group">
              <span className="pattern-label">Emotional Triggers</span>
              <div className="tags">
                {analysis.winningPatterns.emotionalTriggers?.map((item, i) => (
                  <span key={i} className="tag success">{item}</span>
                ))}
              </div>
            </div>
            <div className="pattern-group">
              <span className="pattern-label">Effective CTAs</span>
              <div className="tags">
                {analysis.winningPatterns.callToActions?.map((item, i) => (
                  <span key={i} className="tag cta">{item}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="pattern-card losing">
            <h4>What's Not Working</h4>
            <div className="pattern-group">
              <span className="pattern-label">Problematic Headlines</span>
              <ul>
                {analysis.losingPatterns.headlines?.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="pattern-group">
              <span className="pattern-label">Ineffective Copy</span>
              <ul>
                {analysis.losingPatterns.copyElements?.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            {/* NEW: Visual Issues */}
            {analysis.losingPatterns.visualIssues && analysis.losingPatterns.visualIssues.length > 0 && (
              <div className="pattern-group">
                <span className="pattern-label">Visual Issues</span>
                <ul>
                  {analysis.losingPatterns.visualIssues.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pattern-group">
              <span className="pattern-label">Common Issues</span>
              <ul>
                {analysis.losingPatterns.issues?.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Audience Insights (Enhanced with Visual Preferences) */}
      <section className="insights-section audience-section">
        <h3>Audience Insights</h3>
        <div className="audience-grid">
          <div className="audience-card resonates">
            <h4>What Resonates</h4>
            <ul>
              {analysis.audienceInsights.whatResonates?.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="audience-card doesnt-work">
            <h4>What Doesn't Work</h4>
            <ul>
              {analysis.audienceInsights.whatDoesntWork?.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="audience-card targeting">
            <h4>Targeting Recommendations</h4>
            <ul>
              {analysis.audienceInsights.targetingRecommendations?.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          {/* NEW: Visual Preferences */}
          {analysis.audienceInsights.visualPreferences && analysis.audienceInsights.visualPreferences.length > 0 && (
            <div className="audience-card visual-prefs">
              <h4>Visual Preferences</h4>
              <ul>
                {analysis.audienceInsights.visualPreferences.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Top & Bottom Performers (Enhanced with Image Analysis) */}
      <section className="insights-section performers-section">
        <h3>Ad Performance Breakdown</h3>
        <div className="performers-grid">
          <div className="performers-card top">
            <h4>Top Performers</h4>
            {analysis.topAds?.map((ad, i) => (
              <div key={ad.id || i} className="performer-item">
                <div className="performer-rank">{i + 1}</div>
                <div className="performer-details">
                  <span className="performer-headline">{ad.headline}</span>
                  <span className="performer-cvr">{formatPercent(ad.conversionRate)} CVR</span>
                  <p className="performer-explanation">{ad.whyItWorks}</p>
                  {/* NEW: Image Analysis */}
                  {ad.imageAnalysis && (
                    <div className="image-analysis">
                      <span className="analysis-label">Image Analysis:</span>
                      <p>{ad.imageAnalysis}</p>
                    </div>
                  )}
                  {/* NEW: Psychological Drivers */}
                  {ad.psychologicalDrivers && ad.psychologicalDrivers.length > 0 && (
                    <div className="psychological-drivers">
                      <span className="drivers-label">Psychological Drivers:</span>
                      <div className="tags">
                        {ad.psychologicalDrivers.map((driver, j) => (
                          <span key={j} className="tag psychology">{driver}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="performers-card bottom">
            <h4>Needs Improvement</h4>
            {analysis.bottomAds?.map((ad, i) => (
              <div key={ad.id || i} className="performer-item">
                <div className="performer-rank">{i + 1}</div>
                <div className="performer-details">
                  <span className="performer-headline">{ad.headline}</span>
                  <span className="performer-cvr">{formatPercent(ad.conversionRate)} CVR</span>
                  <p className="performer-explanation">{ad.whyItFails}</p>
                  {/* NEW: Image Issues */}
                  {ad.imageIssues && (
                    <div className="image-issues">
                      <span className="issues-label">Image Issues:</span>
                      <p>{ad.imageIssues}</p>
                    </div>
                  )}
                  {/* NEW: Suggested Fix */}
                  {ad.suggestedFix && (
                    <div className="suggested-fix">
                      <span className="fix-label">Suggested Fix:</span>
                      <p>{ad.suggestedFix}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Strategic Recommendations (Enhanced with Creative Direction) */}
      <section className="insights-section recommendations-section">
        <h3>Strategic Recommendations</h3>
        <div className="recommendations-grid">
          <div className="recommendation-card immediate">
            <div className="recommendation-header">
              <span className="recommendation-icon">🚀</span>
              <h4>Immediate Actions</h4>
            </div>
            <ul>
              {analysis.recommendations.immediate?.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="recommendation-card short-term">
            <div className="recommendation-header">
              <span className="recommendation-icon">📅</span>
              <h4>Short-Term (2 weeks)</h4>
            </div>
            <ul>
              {analysis.recommendations.shortTerm?.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="recommendation-card strategic">
            <div className="recommendation-header">
              <span className="recommendation-icon">🎯</span>
              <h4>Strategic (Long-term)</h4>
            </div>
            <ul>
              {analysis.recommendations.strategic?.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          {/* NEW: Creative Direction */}
          {analysis.recommendations.creativeDirection && analysis.recommendations.creativeDirection.length > 0 && (
            <div className="recommendation-card creative-direction">
              <div className="recommendation-header">
                <span className="recommendation-icon">🎨</span>
                <h4>Creative Direction</h4>
              </div>
              <ul>
                {analysis.recommendations.creativeDirection.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
