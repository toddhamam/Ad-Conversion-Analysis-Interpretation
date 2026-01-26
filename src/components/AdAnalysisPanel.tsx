import { useState } from 'react';
import { analyzeAdCreative, isOpenAIConfigured, type AdCreativeData, type AdAnalysisResult } from '../services/openaiApi';
import { Bot, Sparkles, AlertTriangle, Palette, PenLine, BarChart3, Lightbulb } from 'lucide-react';
import './AdAnalysisPanel.css';

interface AdAnalysisPanelProps {
  ad: AdCreativeData;
  onClose: () => void;
}

export default function AdAnalysisPanel({ ad, onClose }: AdAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<AdAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const runAnalysis = async () => {
    if (!isOpenAIConfigured()) {
      setError('OpenAI API key not configured. Please add your API key to continue.');
      return;
    }

    setLoading(true);
    setError(null);
    setHasStarted(true);

    try {
      console.log('🔍 Starting analysis for ad:', ad.id);
      const result = await analyzeAdCreative(ad);
      console.log('✅ Analysis complete:', result);
      setAnalysis(result);
    } catch (err: any) {
      console.error('❌ Analysis failed:', err);
      setError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return '#10b981';
    if (score >= 6) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="analysis-panel-overlay" onClick={onClose}>
      <div className="analysis-panel" onClick={(e) => e.stopPropagation()}>
        <div className="analysis-panel-header">
          <div className="analysis-panel-title">
            <span className="analysis-icon"><Bot size={20} strokeWidth={1.5} /></span>
            AI Ad Analysis
          </div>
          <button className="analysis-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="analysis-ad-info">
          <h3>{ad.headline}</h3>
          <p>{ad.bodyText}</p>
          <div className="analysis-ad-metrics">
            <span>Conv Rate: <strong>{ad.conversionRate.toFixed(2)}%</strong></span>
            <span>Cost/Conv: <strong>${ad.costPerConversion.toFixed(2)}</strong></span>
            <span>ROAS: <strong>{ad.roas?.toFixed(2) || 'N/A'}x</strong></span>
          </div>
        </div>

        {!hasStarted && !loading && (
          <div className="analysis-start-section">
            <p>Click below to get AI-powered insights on this ad's creative, copy, and performance.</p>
            <button className="analysis-start-btn" onClick={runAnalysis}>
              <span className="btn-icon"><Sparkles size={18} strokeWidth={1.5} /></span>
              Analyze Ad
            </button>
          </div>
        )}

        {loading && (
          <div className="analysis-loading">
            <div className="loading-spinner-ai"></div>
            <p>Analyzing creative, copy, and performance data...</p>
            <p className="loading-subtext">This may take 10-15 seconds</p>
          </div>
        )}

        {error && (
          <div className="analysis-error">
            <span className="error-icon"><AlertTriangle size={18} strokeWidth={1.5} /></span>
            {error}
            <button className="retry-btn" onClick={runAnalysis}>Try Again</button>
          </div>
        )}

        {analysis && !loading && (
          <div className="analysis-results">
            {/* Overall Score */}
            <div className="analysis-score-section">
              <div className="score-circle" style={{ borderColor: getScoreColor(analysis.overallScore) }}>
                <span className="score-value" style={{ color: getScoreColor(analysis.overallScore) }}>
                  {analysis.overallScore}
                </span>
                <span className="score-label">/10</span>
              </div>
              <div className="score-summary">
                <h4>Overall Score</h4>
                <p>{analysis.summary}</p>
              </div>
            </div>

            {/* Creative Analysis */}
            <div className="analysis-section">
              <h4>
                <span className="section-icon"><Palette size={18} strokeWidth={1.5} /></span>
                Creative Analysis
              </h4>
              <div className="analysis-grid">
                <div className="analysis-item strengths">
                  <span className="item-label">Strengths</span>
                  <ul>
                    {analysis.creativeAnalysis.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="analysis-item weaknesses">
                  <span className="item-label">Weaknesses</span>
                  <ul>
                    {analysis.creativeAnalysis.weaknesses.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="analysis-detail">
                <strong>Visual Impact:</strong> {analysis.creativeAnalysis.visualImpact}
              </div>
              <div className="analysis-detail">
                <strong>Brand Alignment:</strong> {analysis.creativeAnalysis.brandAlignment}
              </div>
            </div>

            {/* Copy Analysis */}
            <div className="analysis-section">
              <h4>
                <span className="section-icon"><PenLine size={18} strokeWidth={1.5} /></span>
                Copy Analysis
              </h4>
              <div className="analysis-detail">
                <strong>Headline:</strong> {analysis.copyAnalysis.headlineEffectiveness}
              </div>
              <div className="analysis-detail">
                <strong>Body Text:</strong> {analysis.copyAnalysis.bodyTextAnalysis}
              </div>
              <div className="analysis-detail">
                <strong>Call to Action:</strong> {analysis.copyAnalysis.callToAction}
              </div>
              <div className="analysis-tags">
                <span className="tag-label">Emotional Triggers:</span>
                {analysis.copyAnalysis.emotionalTriggers.map((t, i) => (
                  <span key={i} className="tag trigger">{t}</span>
                ))}
              </div>
              <div className="analysis-tags">
                <span className="tag-label">Persuasion Techniques:</span>
                {analysis.copyAnalysis.persuasionTechniques.map((t, i) => (
                  <span key={i} className="tag technique">{t}</span>
                ))}
              </div>
            </div>

            {/* Performance Insights */}
            <div className="analysis-section">
              <h4>
                <span className="section-icon"><BarChart3 size={18} strokeWidth={1.5} /></span>
                Performance Insights
              </h4>
              <div className="analysis-grid">
                <div className="analysis-item drivers">
                  <span className="item-label">Conversion Drivers</span>
                  <ul>
                    {analysis.performanceInsights.conversionDrivers.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
                <div className="analysis-item issues">
                  <span className="item-label">Potential Issues</span>
                  <ul>
                    {analysis.performanceInsights.potentialIssues.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="analysis-detail">
                <strong>Audience Alignment:</strong> {analysis.performanceInsights.audienceAlignment}
              </div>
            </div>

            {/* Recommendations */}
            <div className="analysis-section recommendations">
              <h4>
                <span className="section-icon"><Lightbulb size={18} strokeWidth={1.5} /></span>
                Recommendations
              </h4>
              <div className="recommendations-grid">
                <div className="recommendation-category">
                  <span className="category-label immediate">Immediate Actions</span>
                  <ul>
                    {analysis.recommendations.immediate.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
                <div className="recommendation-category">
                  <span className="category-label testing">Testing Ideas</span>
                  <ul>
                    {analysis.recommendations.testing.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
                <div className="recommendation-category">
                  <span className="category-label scaling">Scaling Strategy</span>
                  <ul>
                    {analysis.recommendations.scaling.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
