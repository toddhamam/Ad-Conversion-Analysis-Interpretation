import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import Loading from '../components/Loading';
import SEO from '../components/SEO';
import {
  fetchSites,
  createSite,
  getGoogleConnectUrl,
  refreshKeywords,
  fetchArticles,
  generateArticle,
  publishArticle,
  deleteArticle,
} from '../services/seoIqApi';
import type {
  SeoSite,
  SeoKeyword,
  SeoArticle,
  SeoIQTab,
  ArticleStatus,
} from '../types/seoiq';
import './SeoIQ.css';

export default function SeoIQ() {
  const { organization, loading: orgLoading, error: orgError, refresh: refreshOrg } = useOrganization();
  const [searchParams] = useSearchParams();

  // Tab state
  const [activeTab, setActiveTab] = useState<SeoIQTab>('sites');

  // Sites
  const [sites, setSites] = useState<SeoSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [sitesLoading, setSitesLoading] = useState(false);

  // Add site form
  const [showAddSite, setShowAddSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteDomain, setNewSiteDomain] = useState('');
  const [newSiteSupabaseUrl, setNewSiteSupabaseUrl] = useState('');
  const [newSiteSupabaseKey, setNewSiteSupabaseKey] = useState('');
  const [addingSite, setAddingSite] = useState(false);

  // Keywords
  const [keywords, setKeywords] = useState<SeoKeyword[]>([]);
  const [refreshingKeywords, setRefreshingKeywords] = useState(false);
  const [keywordFilter, setKeywordFilter] = useState<string>('all');
  const [keywordSort, setKeywordSort] = useState<'score' | 'volume' | 'position'>('score');

  // Generate
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [manualKeyword, setManualKeyword] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [iqLevel, setIqLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [generating, setGenerating] = useState(false);

  // Articles
  const [articles, setArticles] = useState<SeoArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articleFilter, setArticleFilter] = useState<ArticleStatus | 'all'>('all');
  const [publishingId, setPublishingId] = useState<string | null>(null);

  // Error/success
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedSite = sites.find((s) => s.id === selectedSiteId) || null;

  // Load sites
  const loadSites = useCallback(async () => {
    if (!organization?.id) return;
    setSitesLoading(true);
    try {
      const data = await fetchSites(organization.id);
      setSites(data);
      // Auto-select first site or site from URL params
      const siteIdParam = searchParams.get('site_id');
      if (siteIdParam && data.find((s) => s.id === siteIdParam)) {
        setSelectedSiteId(siteIdParam);
      } else if (data.length > 0 && !selectedSiteId) {
        setSelectedSiteId(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sites');
    } finally {
      setSitesLoading(false);
    }
  }, [organization?.id, searchParams, selectedSiteId]);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  // Check for Google connection success from redirect
  useEffect(() => {
    if (searchParams.get('google_connected') === 'true') {
      setSuccess('Google connected successfully');
      loadSites();
      setTimeout(() => setSuccess(null), 5000);
    }
  }, [searchParams, loadSites]);

  // Load articles when tab or site changes
  useEffect(() => {
    if (activeTab === 'articles' && selectedSiteId) {
      loadArticles();
    }
  }, [activeTab, selectedSiteId]);

  const loadArticles = async () => {
    if (!selectedSiteId) return;
    setArticlesLoading(true);
    try {
      const data = await fetchArticles(selectedSiteId);
      setArticles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load articles');
    } finally {
      setArticlesLoading(false);
    }
  };

  // Add site
  const handleAddSite = async () => {
    if (!newSiteName || !newSiteDomain) {
      setError('Please fill in Site Name and Domain');
      return;
    }
    if (!organization?.id) {
      setError('Organization not loaded. Please refresh the page.');
      console.error('handleAddSite: organization is', organization);
      return;
    }
    setAddingSite(true);
    setError(null);
    try {
      await createSite(organization.id, {
        name: newSiteName,
        domain: newSiteDomain,
        target_supabase_url: newSiteSupabaseUrl || undefined,
        target_supabase_key: newSiteSupabaseKey || undefined,
      });
      setShowAddSite(false);
      setNewSiteName('');
      setNewSiteDomain('');
      setNewSiteSupabaseUrl('');
      setNewSiteSupabaseKey('');
      await loadSites();
      setSuccess('Site added successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add site');
    } finally {
      setAddingSite(false);
    }
  };

  // Refresh keywords
  const handleRefreshKeywords = async () => {
    if (!selectedSiteId) return;
    setRefreshingKeywords(true);
    setError(null);
    try {
      const result = await refreshKeywords(selectedSiteId);
      setSuccess(`Synced ${result.gsc_queries} queries, scored ${result.opportunities_scored} opportunities`);
      // Reload keywords from the returned data
      setKeywords([]); // Will be refetched on next render
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh keywords');
    } finally {
      setRefreshingKeywords(false);
    }
  };

  // Generate article
  const handleGenerate = async () => {
    if (!selectedSiteId) return;
    if (!selectedKeywordId && !manualKeyword) {
      setError('Select a keyword or enter one manually');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const result = await generateArticle({
        site_id: selectedSiteId,
        keyword_id: selectedKeywordId || undefined,
        keyword: !selectedKeywordId ? manualKeyword : undefined,
        custom_instructions: customInstructions || undefined,
        iq_level: iqLevel,
      });
      setSuccess('Article generated successfully');
      setActiveTab('articles');
      setArticles((prev) => [result.article, ...prev]);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate article');
    } finally {
      setGenerating(false);
    }
  };

  // Publish article
  const handlePublish = async (articleId: string) => {
    setPublishingId(articleId);
    setError(null);
    try {
      const result = await publishArticle({
        article_id: articleId,
        generate_thumbnail: true,
        submit_indexing: true,
      });
      setSuccess(`Published to ${result.published_url}`);
      await loadArticles();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish article');
    } finally {
      setPublishingId(null);
    }
  };

  // Delete article
  const handleDeleteArticle = async (articleId: string) => {
    if (!selectedSiteId) return;
    try {
      await deleteArticle(selectedSiteId, articleId);
      setArticles((prev) => prev.filter((a) => a.id !== articleId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete article');
    }
  };

  // Filter and sort keywords
  const filteredKeywords = keywords
    .filter((k) => keywordFilter === 'all' || k.opportunity_type === keywordFilter)
    .sort((a, b) => {
      if (keywordSort === 'score') return b.opportunity_score - a.opportunity_score;
      if (keywordSort === 'volume') return b.search_volume - a.search_volume;
      if (keywordSort === 'position') return (a.current_position || 999) - (b.current_position || 999);
      return 0;
    });

  // Filter articles
  const filteredArticles = articles.filter(
    (a) => articleFilter === 'all' || a.status === articleFilter
  );

  if (orgLoading || sitesLoading) {
    return <Loading size="large" message="ConversionIQ™ loading SEO tools..." />;
  }

  if (orgError || !organization) {
    return (
      <div className="seo-iq-page">
        <SEO title="SEO IQ | Convertra" noindex />
        <div className="seo-iq-header">
          <h1>SEO IQ <span>BETA</span></h1>
        </div>
        <div className="seo-iq-empty">
          <h3>Unable to load organization</h3>
          <p>{orgError || 'Organization data could not be loaded. Please try refreshing.'}</p>
          <button className="seo-iq-btn seo-iq-btn-primary" onClick={() => refreshOrg()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="seo-iq-page">
      <SEO title="SEO IQ | Convertra" noindex />

      {/* Header */}
      <div className="seo-iq-header">
        <h1>SEO IQ <span>BETA</span></h1>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ padding: '10px 16px', marginBottom: 16, borderRadius: 8, background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontSize: 13, fontWeight: 500 }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>×</button>
        </div>
      )}
      {success && (
        <div style={{ padding: '10px 16px', marginBottom: 16, borderRadius: 8, background: 'rgba(22,163,74,0.08)', color: '#16a34a', fontSize: 13, fontWeight: 500 }}>
          {success}
        </div>
      )}

      {/* Site Selector (visible on non-sites tabs) */}
      {activeTab !== 'sites' && sites.length > 0 && (
        <div className="seo-iq-site-selector">
          <label>Site:</label>
          <select value={selectedSiteId || ''} onChange={(e) => setSelectedSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.domain})</option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="seo-iq-tabs">
        <button className={`seo-iq-tab ${activeTab === 'sites' ? 'active' : ''}`} onClick={() => setActiveTab('sites')}>
          Sites
          <span className="seo-iq-tab-badge">{sites.length}</span>
        </button>
        <button
          className={`seo-iq-tab ${activeTab === 'keywords' ? 'active' : ''}`}
          onClick={() => setActiveTab('keywords')}
          disabled={!selectedSiteId}
        >
          Keywords
          {keywords.length > 0 && <span className="seo-iq-tab-badge">{keywords.length}</span>}
        </button>
        <button
          className={`seo-iq-tab ${activeTab === 'generate' ? 'active' : ''}`}
          onClick={() => setActiveTab('generate')}
          disabled={!selectedSiteId}
        >
          Generate
        </button>
        <button
          className={`seo-iq-tab ${activeTab === 'articles' ? 'active' : ''}`}
          onClick={() => setActiveTab('articles')}
          disabled={!selectedSiteId}
        >
          Articles
          {articles.length > 0 && <span className="seo-iq-tab-badge">{articles.length}</span>}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'sites' && renderSitesTab()}
      {activeTab === 'keywords' && renderKeywordsTab()}
      {activeTab === 'generate' && renderGenerateTab()}
      {activeTab === 'articles' && renderArticlesTab()}
    </div>
  );

  // ─── Sites Tab ──────────────────────────────────────────────────────────────

  function renderSitesTab() {
    return (
      <>
        <div className="seo-iq-toolbar">
          <div />
          <button className="seo-iq-btn seo-iq-btn-primary" onClick={() => setShowAddSite(true)}>
            + Add Site
          </button>
        </div>

        {showAddSite && (
          <div className="seo-iq-add-site-form">
            <h3>Add New Site</h3>
            <div className="seo-iq-form-row">
              <div className="seo-iq-form-group">
                <label>Site Name</label>
                <input
                  type="text"
                  placeholder="My Website"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                />
              </div>
              <div className="seo-iq-form-group">
                <label>Domain</label>
                <input
                  type="text"
                  placeholder="example.com"
                  value={newSiteDomain}
                  onChange={(e) => setNewSiteDomain(e.target.value)}
                />
              </div>
            </div>
            <div className="seo-iq-form-row">
              <div className="seo-iq-form-group">
                <label>Target Supabase URL</label>
                <input
                  type="text"
                  placeholder="https://xxx.supabase.co"
                  value={newSiteSupabaseUrl}
                  onChange={(e) => setNewSiteSupabaseUrl(e.target.value)}
                />
              </div>
              <div className="seo-iq-form-group">
                <label>Target Supabase Service Key</label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  value={newSiteSupabaseKey}
                  onChange={(e) => setNewSiteSupabaseKey(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="seo-iq-btn seo-iq-btn-primary" onClick={handleAddSite} disabled={addingSite || !newSiteName || !newSiteDomain}>
                {addingSite ? 'Adding...' : 'Add Site'}
              </button>
              <button className="seo-iq-btn seo-iq-btn-secondary" onClick={() => setShowAddSite(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {sites.length === 0 ? (
          <div className="seo-iq-empty">
            <h3>No sites connected</h3>
            <p>Add a site to start generating SEO-optimized articles</p>
            <button className="seo-iq-btn seo-iq-btn-primary" onClick={() => setShowAddSite(true)}>
              + Add Your First Site
            </button>
          </div>
        ) : (
          <div className="seo-iq-cards">
            {sites.map((site) => (
              <div key={site.id} className="seo-iq-card">
                <div className="seo-iq-card-header">
                  <span className="seo-iq-card-title">{site.name}</span>
                  <span className={`seo-iq-status ${site.google_status}`}>
                    {site.google_status === 'active' ? 'Connected' : site.google_status === 'not_connected' ? 'Not Connected' : site.google_status}
                  </span>
                </div>
                <div className="seo-iq-card-domain">{site.domain}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {site.google_status !== 'active' ? (
                    <a
                      href={getGoogleConnectUrl(site.id, '/seo-iq')}
                      className="seo-iq-btn seo-iq-btn-violet"
                      style={{ textDecoration: 'none' }}
                    >
                      Connect Google
                    </a>
                  ) : (
                    <button
                      className="seo-iq-btn seo-iq-btn-secondary"
                      onClick={() => {
                        setSelectedSiteId(site.id);
                        setActiveTab('keywords');
                      }}
                    >
                      View Keywords
                    </button>
                  )}
                  <button
                    className="seo-iq-btn seo-iq-btn-secondary"
                    onClick={() => {
                      setSelectedSiteId(site.id);
                      setActiveTab('articles');
                    }}
                  >
                    Articles
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  // ─── Keywords Tab ─────────────────────────────────────────────────────────

  function renderKeywordsTab() {
    if (!selectedSite) {
      return <div className="seo-iq-empty"><p>Select a site first</p></div>;
    }

    if (selectedSite.google_status !== 'active') {
      return (
        <div className="seo-iq-empty">
          <h3>Google not connected</h3>
          <p>Connect Google Search Console to pull keyword data</p>
          <a href={getGoogleConnectUrl(selectedSite.id, '/seo-iq')} className="seo-iq-btn seo-iq-btn-violet" style={{ textDecoration: 'none' }}>
            Connect Google
          </a>
        </div>
      );
    }

    return (
      <>
        <div className="seo-iq-toolbar">
          <div className="seo-iq-toolbar-left">
            <select className="seo-iq-filter" value={keywordFilter} onChange={(e) => setKeywordFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="quick_win">Quick Wins</option>
              <option value="content_gap">Content Gaps</option>
              <option value="ctr_optimization">CTR Optimization</option>
              <option value="cluster_gap">Cluster Gaps</option>
            </select>
            <select className="seo-iq-filter" value={keywordSort} onChange={(e) => setKeywordSort(e.target.value as typeof keywordSort)}>
              <option value="score">Sort by Score</option>
              <option value="volume">Sort by Volume</option>
              <option value="position">Sort by Position</option>
            </select>
          </div>
          <button
            className="seo-iq-btn seo-iq-btn-primary"
            onClick={handleRefreshKeywords}
            disabled={refreshingKeywords}
          >
            {refreshingKeywords ? 'Syncing...' : 'Refresh Keywords'}
          </button>
        </div>

        {refreshingKeywords && (
          <Loading size="medium" message="ConversionIQ™ syncing search data..." />
        )}

        {!refreshingKeywords && filteredKeywords.length === 0 ? (
          <div className="seo-iq-empty">
            <h3>No keywords yet</h3>
            <p>Click "Refresh Keywords" to pull data from Google Search Console</p>
          </div>
        ) : !refreshingKeywords && (
          <div className="seo-iq-table-wrapper">
            <table className="seo-iq-table">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Score</th>
                  <th>Type</th>
                  <th>Position</th>
                  <th>Impressions</th>
                  <th>CTR</th>
                  <th>Clicks</th>
                  <th>Cluster</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredKeywords.map((kw) => (
                  <tr key={kw.id}>
                    <td className="keyword-cell">{kw.keyword}</td>
                    <td className={`score-cell ${kw.opportunity_score >= 70 ? 'score-high' : kw.opportunity_score >= 40 ? 'score-medium' : 'score-low'}`}>
                      {kw.opportunity_score}
                    </td>
                    <td>
                      {kw.opportunity_type && (
                        <span className={`seo-iq-opp-tag ${kw.opportunity_type}`}>
                          {kw.opportunity_type.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td>{kw.current_position ? kw.current_position.toFixed(1) : '—'}</td>
                    <td>{kw.impressions.toLocaleString()}</td>
                    <td>{kw.ctr.toFixed(1)}%</td>
                    <td>{kw.clicks}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{kw.topic_cluster}</td>
                    <td>
                      <button
                        className="seo-iq-btn seo-iq-btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => {
                          setSelectedKeywordId(kw.id);
                          setManualKeyword(kw.keyword);
                          setActiveTab('generate');
                        }}
                      >
                        Generate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  // ─── Generate Tab ─────────────────────────────────────────────────────────

  function renderGenerateTab() {
    if (!selectedSite) {
      return <div className="seo-iq-empty"><p>Select a site first</p></div>;
    }

    const selectedKeyword = keywords.find((k) => k.id === selectedKeywordId);

    return (
      <div className="seo-iq-generate">
        <div className="seo-iq-form-group">
          <label>Target Keyword</label>
          <input
            type="text"
            placeholder="Enter a keyword or select from Keywords tab"
            value={selectedKeyword?.keyword || manualKeyword}
            onChange={(e) => {
              setManualKeyword(e.target.value);
              setSelectedKeywordId(null);
            }}
          />
          {selectedKeyword && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Score: {selectedKeyword.opportunity_score} | Type: {selectedKeyword.opportunity_type} | Cluster: {selectedKeyword.topic_cluster}
            </div>
          )}
        </div>

        <div className="seo-iq-form-group">
          <label>ConversionIQ™ Level</label>
          <select value={iqLevel} onChange={(e) => setIqLevel(e.target.value as typeof iqLevel)}>
            <option value="low">IQ Standard (~10 sec)</option>
            <option value="medium">IQ Deep (~30 sec)</option>
            <option value="high">IQ Maximum (~60 sec)</option>
          </select>
        </div>

        <div className="seo-iq-form-group">
          <label>Custom Instructions (optional)</label>
          <textarea
            placeholder="Any specific instructions for the article... (e.g., mention a specific product, target a particular audience)"
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
          />
        </div>

        <button
          className="seo-iq-btn seo-iq-btn-violet"
          onClick={handleGenerate}
          disabled={generating || (!selectedKeywordId && !manualKeyword)}
          style={{ padding: '12px 24px', fontSize: 15 }}
        >
          {generating ? 'Generating...' : 'Generate Article'}
        </button>

        {generating && (
          <div style={{ marginTop: 20 }}>
            <Loading size="medium" message="ConversionIQ™ writing article..." />
          </div>
        )}
      </div>
    );
  }

  // ─── Articles Tab ─────────────────────────────────────────────────────────

  function renderArticlesTab() {
    if (!selectedSite) {
      return <div className="seo-iq-empty"><p>Select a site first</p></div>;
    }

    if (articlesLoading) {
      return <Loading size="medium" message="ConversionIQ™ loading articles..." />;
    }

    return (
      <>
        <div className="seo-iq-toolbar">
          <div className="seo-iq-toolbar-left">
            <select className="seo-iq-filter" value={articleFilter} onChange={(e) => setArticleFilter(e.target.value as typeof articleFilter)}>
              <option value="all">All Status</option>
              <option value="draft">Drafts</option>
              <option value="published">Published</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <button
            className="seo-iq-btn seo-iq-btn-primary"
            onClick={() => setActiveTab('generate')}
          >
            + Generate New
          </button>
        </div>

        {filteredArticles.length === 0 ? (
          <div className="seo-iq-empty">
            <h3>No articles yet</h3>
            <p>Generate your first article from the Generate tab</p>
          </div>
        ) : (
          filteredArticles.map((article) => (
            <div key={article.id} className="seo-iq-article-preview">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h3>{article.title}</h3>
                <span className={`seo-iq-status ${article.status}`}>{article.status}</span>
              </div>
              <div className="seo-iq-article-meta">
                <span>/{article.slug}</span>
                <span>{article.word_count} words</span>
                <span>{article.category}</span>
                <span>{article.primary_keyword}</span>
                {article.published_url && <span>{article.published_url}</span>}
              </div>
              {article.meta_description && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  {article.meta_description}
                </p>
              )}
              <div className="seo-iq-article-actions">
                {article.status === 'draft' && (
                  <button
                    className="seo-iq-btn seo-iq-btn-violet"
                    onClick={() => handlePublish(article.id)}
                    disabled={publishingId === article.id}
                  >
                    {publishingId === article.id ? 'Publishing...' : 'Publish'}
                  </button>
                )}
                {article.status === 'failed' && (
                  <button
                    className="seo-iq-btn seo-iq-btn-primary"
                    onClick={() => handlePublish(article.id)}
                    disabled={publishingId === article.id}
                  >
                    Retry Publish
                  </button>
                )}
                <button
                  className="seo-iq-btn seo-iq-btn-secondary"
                  onClick={() => handleDeleteArticle(article.id)}
                  style={{ color: '#dc2626' }}
                >
                  Delete
                </button>
              </div>
              {article.publish_error && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>
                  Error: {article.publish_error}
                </div>
              )}
            </div>
          ))
        )}
      </>
    );
  }
}
