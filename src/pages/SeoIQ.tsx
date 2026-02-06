import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import Loading from '../components/Loading';
import SEO from '../components/SEO';
import {
  fetchSites,
  createSite,
  getGoogleConnectUrl,
  fetchKeywords,
  refreshKeywords,
  fetchArticles,
  generateArticle,
  publishArticle,
  deleteArticle,
  fetchAutopilotStatus,
  updateAutopilotConfig,
  autopilotPickKeyword,
  fetchScheduledRuns,
  createScheduledRuns,
  deleteScheduledRun,
} from '../services/seoIqApi';
import type {
  SeoSite,
  SeoKeyword,
  SeoArticle,
  SeoIQTab,
  ArticleStatus,
  AutopilotConfig,
  ScheduledRun,
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

  // Autopilot
  const [autopilotConfig, setAutopilotConfig] = useState<AutopilotConfig | null>(null);
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [autopilotStepStatus, setAutopilotStepStatus] = useState<Record<number, 'pending' | 'running' | 'done' | 'failed'>>({});
  const [autopilotResult, setAutopilotResult] = useState<{ keyword?: string; articleTitle?: string; publishedUrl?: string } | null>(null);
  const [autopilotArticleNum, setAutopilotArticleNum] = useState(0);
  const [autopilotTotalArticles, setAutopilotTotalArticles] = useState(1);

  // Content Calendar
  const [scheduledRuns, setScheduledRuns] = useState<ScheduledRun[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [showScheduleMonth, setShowScheduleMonth] = useState(false);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 3, 5]); // Mon, Wed, Fri

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

  // Load autopilot config when tab or site changes
  useEffect(() => {
    if (activeTab === 'autopilot' && selectedSiteId) {
      fetchAutopilotStatus(selectedSiteId).then(setAutopilotConfig).catch(console.error);
    }
  }, [activeTab, selectedSiteId]);

  // Load scheduled runs when autopilot tab is active
  useEffect(() => {
    if (activeTab === 'autopilot' && selectedSiteId) {
      setScheduleLoading(true);
      fetchScheduledRuns(selectedSiteId, calendarMonth)
        .then(setScheduledRuns)
        .catch(console.error)
        .finally(() => setScheduleLoading(false));
    }
  }, [activeTab, selectedSiteId, calendarMonth]);

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

  // Load keywords for selected site
  const loadKeywords = useCallback(async (siteId: string) => {
    try {
      const data = await fetchKeywords(siteId);
      setKeywords(data);
    } catch (err) {
      console.error('Failed to load keywords:', err);
    }
  }, []);

  // Load keywords when tab or site changes
  useEffect(() => {
    if ((activeTab === 'keywords' || activeTab === 'generate') && selectedSiteId) {
      loadKeywords(selectedSiteId);
    }
  }, [activeTab, selectedSiteId, loadKeywords]);

  // Refresh keywords
  const handleRefreshKeywords = async () => {
    if (!selectedSiteId) return;
    setRefreshingKeywords(true);
    setError(null);
    try {
      const result = await refreshKeywords(selectedSiteId);
      setSuccess(`Synced ${result.gsc_queries} queries, scored ${result.opportunities_scored} opportunities`);
      // Reload keywords from the database
      await loadKeywords(selectedSiteId);
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

  // ─── Autopilot handlers ───────────────────────────────────────────────────

  const handleRunAutopilot = async () => {
    if (!selectedSiteId) return;

    setAutopilotRunning(true);
    setAutopilotResult(null);
    setError(null);

    const totalArticles = autopilotConfig?.autopilot_articles_per_run || 1;
    setAutopilotTotalArticles(totalArticles);

    let currentStep = 0;
    try {
      // Step 1: Refresh keywords (once for all articles)
      currentStep = 1;
      setAutopilotStepStatus({ 1: 'running' });
      await refreshKeywords(selectedSiteId);
      setAutopilotStepStatus((prev) => ({ ...prev, 1: 'done' }));

      for (let i = 0; i < totalArticles; i++) {
        setAutopilotArticleNum(i + 1);

        // Step 2: Pick keyword
        currentStep = 2;
        setAutopilotStepStatus((prev) => ({ ...prev, 2: 'running', 3: 'pending', 4: 'pending' }));
        const keyword = await autopilotPickKeyword(selectedSiteId);
        setAutopilotStepStatus((prev) => ({ ...prev, 2: 'done' }));

        // Step 3: Generate article
        currentStep = 3;
        setAutopilotStepStatus((prev) => ({ ...prev, 3: 'running' }));
        const generated = await generateArticle({
          site_id: selectedSiteId,
          keyword_id: keyword.id,
          iq_level: autopilotConfig?.autopilot_iq_level || 'medium',
        });
        setAutopilotStepStatus((prev) => ({ ...prev, 3: 'done' }));

        // Step 4: Publish + Index
        currentStep = 4;
        setAutopilotStepStatus((prev) => ({ ...prev, 4: 'running' }));
        const published = await publishArticle({
          article_id: generated.article.id,
          generate_thumbnail: true,
          submit_indexing: true,
        });
        setAutopilotStepStatus((prev) => ({ ...prev, 4: 'done' }));

        setAutopilotResult({
          keyword: keyword.keyword,
          articleTitle: generated.article.title,
          publishedUrl: published.published_url,
        });
      }

      // Update last run time
      await updateAutopilotConfig(selectedSiteId, { autopilot_pipeline_step: null });
      setSuccess(`Autopilot complete — ${totalArticles} article(s) published`);
      setTimeout(() => setSuccess(null), 8000);
    } catch (err) {
      setAutopilotStepStatus((prev) => ({ ...prev, [currentStep]: 'failed' }));
      setError(err instanceof Error ? err.message : 'Autopilot failed');
    } finally {
      setAutopilotRunning(false);
    }
  };

  const handleResumeAutopilot = async () => {
    if (!selectedSiteId || !autopilotConfig?.autopilot_pipeline_keyword_id) return;

    setAutopilotRunning(true);
    setAutopilotResult(null);
    setError(null);
    setAutopilotTotalArticles(1);
    setAutopilotArticleNum(1);

    let currentStep = 3;
    try {
      // Steps 1-2 already done by cron
      setAutopilotStepStatus({ 1: 'done', 2: 'done', 3: 'running' });

      const generated = await generateArticle({
        site_id: selectedSiteId,
        keyword_id: autopilotConfig.autopilot_pipeline_keyword_id,
        iq_level: autopilotConfig.autopilot_iq_level || 'medium',
      });
      setAutopilotStepStatus((prev) => ({ ...prev, 3: 'done' }));

      currentStep = 4;
      setAutopilotStepStatus((prev) => ({ ...prev, 4: 'running' }));
      const published = await publishArticle({
        article_id: generated.article.id,
        generate_thumbnail: true,
        submit_indexing: true,
      });
      setAutopilotStepStatus((prev) => ({ ...prev, 4: 'done' }));

      // Clear pipeline state
      await updateAutopilotConfig(selectedSiteId, { autopilot_pipeline_step: null });
      const newConfig = await fetchAutopilotStatus(selectedSiteId);
      setAutopilotConfig(newConfig);

      setAutopilotResult({
        keyword: generated.article.primary_keyword || '',
        articleTitle: generated.article.title,
        publishedUrl: published.published_url,
      });

      setSuccess('Autopilot resumed — article published');
      setTimeout(() => setSuccess(null), 8000);
    } catch (err) {
      setAutopilotStepStatus((prev) => ({ ...prev, [currentStep]: 'failed' }));
      setError(err instanceof Error ? err.message : 'Resume failed');
    } finally {
      setAutopilotRunning(false);
    }
  };

  const handleAutopilotConfigChange = async (changes: Partial<Pick<AutopilotConfig, 'autopilot_enabled' | 'autopilot_cadence' | 'autopilot_iq_level' | 'autopilot_articles_per_run'>>) => {
    if (!selectedSiteId) return;
    try {
      const updated = await updateAutopilotConfig(selectedSiteId, changes);
      setAutopilotConfig(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update autopilot config');
    }
  };

  // ─── Content Calendar handlers ──────────────────────────────────────────

  const handleCalendarDayClick = async (dateStr: string) => {
    if (!selectedSiteId) return;
    const existing = scheduledRuns.find((r) => r.scheduled_date === dateStr);
    if (existing) {
      if (existing.status !== 'pending') return; // Only delete pending runs
      try {
        await deleteScheduledRun(selectedSiteId, dateStr);
        setScheduledRuns((prev) => prev.filter((r) => r.scheduled_date !== dateStr));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove scheduled run');
      }
    } else {
      try {
        const created = await createScheduledRuns(selectedSiteId, [dateStr]);
        setScheduledRuns((prev) => [...prev, ...created]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to schedule run');
      }
    }
  };

  const handleScheduleMonth = async () => {
    if (!selectedSiteId) return;
    const [year, mon] = calendarMonth.split('-').map(Number);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const dates: string[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, mon - 1, d);
      if (date <= today) continue; // Skip past and today
      if (!selectedWeekdays.includes(date.getDay())) continue;
      const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (scheduledRuns.find((r) => r.scheduled_date === dateStr)) continue; // Skip existing
      dates.push(dateStr);
    }

    if (dates.length === 0) {
      setShowScheduleMonth(false);
      return;
    }

    try {
      const created = await createScheduledRuns(selectedSiteId, dates);
      setScheduledRuns((prev) => [...prev, ...created]);
      setShowScheduleMonth(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule month');
    }
  };

  const handleRunReadyArticles = async () => {
    if (!selectedSiteId) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const readyRuns = scheduledRuns.filter(
      (r) => r.scheduled_date === todayStr && r.status === 'keyword_picked' && r.keyword_id
    );
    if (readyRuns.length === 0) return;

    setAutopilotRunning(true);
    setAutopilotResult(null);
    setError(null);
    setAutopilotTotalArticles(readyRuns.length);

    let currentStep = 0;
    try {
      for (let i = 0; i < readyRuns.length; i++) {
        const run = readyRuns[i];
        setAutopilotArticleNum(i + 1);

        // Step 3: Generate article (steps 1-2 done by cron)
        currentStep = 3;
        setAutopilotStepStatus({ 1: 'done', 2: 'done', 3: 'running' });
        const generated = await generateArticle({
          site_id: selectedSiteId,
          keyword_id: run.keyword_id!,
          iq_level: autopilotConfig?.autopilot_iq_level || 'medium',
        });
        setAutopilotStepStatus((prev) => ({ ...prev, 3: 'done' }));

        // Step 4: Publish + Index
        currentStep = 4;
        setAutopilotStepStatus((prev) => ({ ...prev, 4: 'running' }));
        const published = await publishArticle({
          article_id: generated.article.id,
          generate_thumbnail: true,
          submit_indexing: true,
        });
        setAutopilotStepStatus((prev) => ({ ...prev, 4: 'done' }));

        // Update the scheduled run in local state
        setScheduledRuns((prev) =>
          prev.map((r) =>
            r.id === run.id
              ? { ...r, status: 'completed' as const, article_id: generated.article.id, article_title: generated.article.title, published_url: published.published_url }
              : r
          )
        );

        setAutopilotResult({
          keyword: run.keyword_text || '',
          articleTitle: generated.article.title,
          publishedUrl: published.published_url,
        });
      }

      setSuccess(`${readyRuns.length} scheduled article(s) published`);
      setTimeout(() => setSuccess(null), 8000);
    } catch (err) {
      setAutopilotStepStatus((prev) => ({ ...prev, [currentStep]: 'failed' }));
      setError(err instanceof Error ? err.message : 'Scheduled run failed');
    } finally {
      setAutopilotRunning(false);
    }
  };

  const calendarMonthLabel = (() => {
    const [year, mon] = calendarMonth.split('-').map(Number);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[mon - 1]} ${year}`;
  })();

  const navigateMonth = (delta: number) => {
    const [year, mon] = calendarMonth.split('-').map(Number);
    const d = new Date(year, mon - 1 + delta, 1);
    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
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
        <button
          className={`seo-iq-tab ${activeTab === 'autopilot' ? 'active' : ''}`}
          onClick={() => setActiveTab('autopilot')}
          disabled={!selectedSiteId}
        >
          Autopilot
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'sites' && renderSitesTab()}
      {activeTab === 'keywords' && renderKeywordsTab()}
      {activeTab === 'generate' && renderGenerateTab()}
      {activeTab === 'articles' && renderArticlesTab()}
      {activeTab === 'autopilot' && renderAutopilotTab()}
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

  // ─── Autopilot Tab ───────────────────────────────────────────────────────

  function renderAutopilotTab() {
    if (!selectedSite) {
      return <div className="seo-iq-empty"><p>Select a site first</p></div>;
    }

    if (selectedSite.google_status !== 'active') {
      return (
        <div className="seo-iq-empty">
          <h3>Google not connected</h3>
          <p>Connect Google Search Console before running autopilot</p>
          <a href={getGoogleConnectUrl(selectedSite.id, '/seo-iq')} className="seo-iq-btn seo-iq-btn-violet" style={{ textDecoration: 'none' }}>
            Connect Google
          </a>
        </div>
      );
    }

    const steps = [
      { num: 1, label: 'Refresh Keywords', desc: 'Sync latest data from GSC' },
      { num: 2, label: 'Pick Keyword', desc: 'Select highest-opportunity keyword' },
      { num: 3, label: 'Generate Article', desc: 'AI writes SEO-optimized content' },
      { num: 4, label: 'Publish & Index', desc: 'Push to site + submit to Google' },
    ];

    return (
      <div className="autopilot-container">
        {/* Run Now */}
        <div className="autopilot-run-section">
          <button
            className="autopilot-run-btn"
            onClick={handleRunAutopilot}
            disabled={autopilotRunning}
          >
            {autopilotRunning
              ? `Running... (Article ${autopilotArticleNum} of ${autopilotTotalArticles})`
              : 'Run Autopilot Now'}
          </button>
          <p className="autopilot-run-desc">
            Refreshes keywords, picks the best opportunity, generates an article, publishes it, and submits to Google for indexing.
          </p>
        </div>

        {/* Resume Banner */}
        {autopilotConfig?.autopilot_pipeline_step === 'awaiting_generation' && !autopilotRunning && (
          <div className="autopilot-resume-banner">
            <div>
              <strong>Scheduled run ready — keyword picked</strong>
              <p>Click Resume to generate and publish the article.</p>
            </div>
            <button className="seo-iq-btn seo-iq-btn-violet" onClick={handleResumeAutopilot}>
              Resume
            </button>
          </div>
        )}

        {/* Progress Stepper */}
        {(autopilotRunning || Object.keys(autopilotStepStatus).length > 0) && (
          <div className="autopilot-stepper">
            {steps.map((step) => {
              const status = autopilotStepStatus[step.num] || 'pending';
              return (
                <div key={step.num} className={`autopilot-step ${status}`}>
                  <div className="autopilot-step-indicator">
                    {status === 'done' ? '\u2713' : status === 'running' ? '\u21BB' : status === 'failed' ? '\u2717' : step.num}
                  </div>
                  <div className="autopilot-step-content">
                    <div className="autopilot-step-label">{step.label}</div>
                    <div className="autopilot-step-desc">{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Result Card */}
        {autopilotResult && !autopilotRunning && (
          <div className="autopilot-result">
            <h3>Last Autopilot Result</h3>
            <div className="autopilot-result-row">
              <span className="autopilot-result-label">Keyword</span>
              <span>{autopilotResult.keyword}</span>
            </div>
            <div className="autopilot-result-row">
              <span className="autopilot-result-label">Article</span>
              <span>{autopilotResult.articleTitle}</span>
            </div>
            {autopilotResult.publishedUrl && (
              <div className="autopilot-result-row">
                <span className="autopilot-result-label">Published</span>
                <a href={autopilotResult.publishedUrl} target="_blank" rel="noopener noreferrer">
                  {autopilotResult.publishedUrl}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Content Calendar */}
        {(() => {
          const [year, mon] = calendarMonth.split('-').map(Number);
          const daysInMonth = new Date(year, mon, 0).getDate();
          const firstDayOfWeek = new Date(year, mon - 1, 1).getDay(); // 0=Sun
          const todayStr = new Date().toISOString().split('T')[0];
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          // Shift so Monday=0 (ISO week)
          const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

          const readyToday = scheduledRuns.filter(
            (r) => r.scheduled_date === todayStr && r.status === 'keyword_picked'
          );

          return (
            <div className="calendar-section">
              <div className="calendar-header">
                <h3>Content Calendar</h3>
                <div className="calendar-nav">
                  <button className="calendar-nav-btn" onClick={() => navigateMonth(-1)}>&lt;</button>
                  <span className="calendar-month-label">{calendarMonthLabel}</span>
                  <button className="calendar-nav-btn" onClick={() => navigateMonth(1)}>&gt;</button>
                </div>
                <button
                  className="calendar-schedule-btn"
                  onClick={() => setShowScheduleMonth(!showScheduleMonth)}
                >
                  Schedule Month
                </button>
              </div>

              {/* Schedule Month Popover */}
              {showScheduleMonth && (
                <div className="calendar-schedule-popover">
                  <div className="calendar-schedule-weekdays">
                    {weekdayLabels.map((label, i) => {
                      const dayNum = i === 6 ? 0 : i + 1; // Mon=1...Sat=6, Sun=0
                      const checked = selectedWeekdays.includes(dayNum);
                      return (
                        <label key={label} className="calendar-weekday-check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedWeekdays((prev) =>
                                checked ? prev.filter((d) => d !== dayNum) : [...prev, dayNum]
                              );
                            }}
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                  <button className="calendar-apply-btn" onClick={handleScheduleMonth}>
                    Apply
                  </button>
                </div>
              )}

              {/* Ready Today Banner */}
              {readyToday.length > 0 && !autopilotRunning && (
                <div className="calendar-ready-banner">
                  <div>
                    <strong>{readyToday.length} article{readyToday.length > 1 ? 's' : ''} ready for today</strong>
                    <p>Keywords pre-selected by the overnight cron. Click to generate and publish.</p>
                  </div>
                  <button className="seo-iq-btn seo-iq-btn-violet" onClick={handleRunReadyArticles}>
                    Generate All
                  </button>
                </div>
              )}

              {/* Calendar Grid */}
              {scheduleLoading ? (
                <Loading size="small" message="ConversionIQ™ loading calendar..." />
              ) : (
                <div className="calendar-grid">
                  {weekdayLabels.map((label) => (
                    <div key={label} className="calendar-weekday-header">{label}</div>
                  ))}
                  {Array.from({ length: startOffset }).map((_, i) => (
                    <div key={`empty-${i}`} className="calendar-day empty" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const run = scheduledRuns.find((r) => r.scheduled_date === dateStr);
                    const dateObj = new Date(year, mon - 1, day);
                    const isPast = dateObj < today;
                    const isToday = dateStr === todayStr;
                    const isClickable = !isPast && (!run || run.status === 'pending');

                    let statusClass = '';
                    if (run) {
                      statusClass = `status-${run.status}`;
                    }

                    return (
                      <div
                        key={day}
                        className={`calendar-day ${statusClass} ${isToday ? 'today' : ''} ${isPast ? 'past' : ''} ${isClickable ? 'clickable' : ''}`}
                        onClick={() => isClickable && !isPast && handleCalendarDayClick(dateStr)}
                      >
                        <span className="calendar-day-num">{day}</span>
                        {run && <span className={`calendar-dot ${run.status}`} />}
                        {run?.keyword_text && (
                          <span className="calendar-day-keyword" title={run.keyword_text}>
                            {run.keyword_text.length > 12 ? run.keyword_text.slice(0, 12) + '...' : run.keyword_text}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Config Panel */}
        <div className="autopilot-config">
          <h3>Schedule Settings</h3>
          <div className="autopilot-config-row">
            <label>
              <input
                type="checkbox"
                checked={autopilotConfig?.autopilot_enabled || false}
                onChange={(e) => handleAutopilotConfigChange({ autopilot_enabled: e.target.checked })}
                disabled={autopilotRunning}
              />
              Enable scheduled autopilot
            </label>
          </div>
          {autopilotConfig?.autopilot_enabled && (
            <>
              <div className="autopilot-config-row">
                <label>Cadence</label>
                <select
                  value={autopilotConfig.autopilot_cadence || 'weekly'}
                  onChange={(e) => handleAutopilotConfigChange({ autopilot_cadence: e.target.value as 'daily' | 'every_3_days' | 'weekly' })}
                  disabled={autopilotRunning}
                >
                  <option value="daily">Daily</option>
                  <option value="every_3_days">Every 3 Days</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div className="autopilot-config-row">
                <label>IQ Level</label>
                <select
                  value={autopilotConfig.autopilot_iq_level || 'medium'}
                  onChange={(e) => handleAutopilotConfigChange({ autopilot_iq_level: e.target.value as 'low' | 'medium' | 'high' })}
                  disabled={autopilotRunning}
                >
                  <option value="low">IQ Standard (~10 sec)</option>
                  <option value="medium">IQ Deep (~30 sec)</option>
                  <option value="high">IQ Maximum (~60 sec)</option>
                </select>
              </div>
              <div className="autopilot-config-row">
                <label>Articles per Run</label>
                <select
                  value={autopilotConfig.autopilot_articles_per_run || 1}
                  onChange={(e) => handleAutopilotConfigChange({ autopilot_articles_per_run: parseInt(e.target.value) })}
                  disabled={autopilotRunning}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </div>
              {autopilotConfig.autopilot_next_run_at && (
                <div className="autopilot-config-info">
                  Next scheduled run: {new Date(autopilotConfig.autopilot_next_run_at).toLocaleString()}
                </div>
              )}
            </>
          )}
          {autopilotConfig?.autopilot_last_run_at && (
            <div className="autopilot-config-info">
              Last run: {new Date(autopilotConfig.autopilot_last_run_at).toLocaleString()}
            </div>
          )}
          {autopilotConfig?.autopilot_last_error && (
            <div className="autopilot-config-error">
              Last error: {autopilotConfig.autopilot_last_error}
            </div>
          )}
        </div>
      </div>
    );
  }
}
